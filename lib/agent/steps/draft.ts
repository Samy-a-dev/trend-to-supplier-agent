import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { Event, InvocationContext } from "@google/adk";
import { PipelineStep } from "../base-step";
import { generateJSON, MODELS } from "../../adapters/gemini";
import { recordOutreach } from "../../db/store";
import { toolEvent } from "../../log";
import { STATE, type OutreachEmail, type Opportunity, type Supplier, type VariantConcept } from "../../types";

const EmailsSchema = z.object({
  emails: z.array(
    z.object({
      supplierName: z.string(),
      subject: z.string(),
      body: z.string(),
    }),
  ),
});

function guessEmail(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return host ? `sales@${host}` : "";
  } catch {
    return "";
  }
}

/** Step 8 — draft per-supplier RFQ emails (stored as drafts; never sent here). */
export class DraftStep extends PipelineStep {
  protected critical = false;
  constructor() {
    super("draft", "Draft RFQ outreach emails for the supplier shortlist");
  }

  protected async *runAsyncImpl(ctx: InvocationContext): AsyncGenerator<Event, void, void> {
    const runId = this.read<string>(ctx, STATE.runId) ?? "";
    const opp = this.read<Opportunity>(ctx, STATE.opportunity);
    const variant = this.read<VariantConcept>(ctx, STATE.variant);
    const suppliers = (this.read<Supplier[]>(ctx, STATE.suppliers) ?? []).slice(0, 3);
    if (!opp) throw new Error("draft: no opportunity in state");

    yield this.event(ctx, `Drafting RFQs for ${suppliers.length} supplier(s)…`, "step_start");

    if (suppliers.length === 0) {
      yield this.event(ctx, "No suppliers to draft for", "step_done", { [STATE.emails]: [] });
      return;
    }

    const out = await generateJSON<z.infer<typeof EmailsSchema>>({
      model: MODELS.reason,
      thinking: "low",
      schema: EmailsSchema,
      prompt:
        `Write a private-label RFQ email to each supplier below for this product:\n` +
        `Product: ${variant?.name ?? opp.title}\nSpec: ${variant?.spec ?? opp.summary}\n` +
        `Key features: ${(variant?.features ?? []).join(", ")}\n\n` +
        `Each email must: introduce the private-label intent, list target features, and request: ` +
        `MOQ, unit pricing at 200/500/1000 units, sample cost + timeline, customization options, ` +
        `packaging options, certifications, production lead time, and shipping. Professional, concise. ` +
        `Return one email per supplier with supplierName, subject, body.\n\n` +
        `Suppliers:\n${suppliers.map((s) => `- ${s.name} (${s.url})`).join("\n")}`,
    });

    const byName = new Map(suppliers.map((s) => [s.name, s]));
    const emails: OutreachEmail[] = out.emails.map((e) => {
      const supplier = byName.get(e.supplierName) ?? suppliers[0];
      return {
        id: randomUUID(),
        supplierName: e.supplierName,
        toEmail: guessEmail(supplier?.url ?? ""),
        subject: e.subject,
        body: e.body,
        status: "draft" as const,
      };
    });

    if (emails.length > 0) {
      await recordOutreach(runId, emails);
      yield this.event(
        ctx,
        `ClickHouse ← ${emails.length} row(s) → outreach_emails (status=draft)`,
        "progress",
        undefined,
        toolEvent("clickhouse", "INSERT → outreach_emails", {
          table: "outreach_emails",
          rows: emails.length,
          status: "draft",
        }),
      );
    }

    yield this.event(ctx, `Drafted ${emails.length} RFQ email(s)`, "step_done", {
      [STATE.emails]: emails,
    });
  }
}
