import { z } from "zod";
import type { Event, InvocationContext } from "@google/adk";
import { PipelineStep } from "../base-step";
import { searchSuppliers } from "../../adapters/tavily";
import { generateJSON, MODELS } from "../../adapters/gemini";
import { recordSuppliers } from "../../db/store";
import { STATE, type Opportunity, type Supplier } from "../../types";

const SuppliersSchema = z.object({
  suppliers: z.array(
    z.object({
      name: z.string(),
      url: z.string(),
      country: z.string().optional(),
      moq: z.string().optional(),
      capabilities: z.string().optional(),
      fitScore: z.number(),
    }),
  ),
});

/** Step 5 — discover private-label / OEM suppliers (before scoring, so fit is real). */
export class SuppliersStep extends PipelineStep {
  protected critical = false;
  constructor() {
    super("suppliers", "Find OEM / private-label suppliers");
  }

  protected async *runAsyncImpl(ctx: InvocationContext): AsyncGenerator<Event, void, void> {
    const runId = this.read<string>(ctx, STATE.runId) ?? "";
    const opp = this.read<Opportunity>(ctx, STATE.opportunity);
    if (!opp) throw new Error("suppliers: no opportunity in state");

    yield this.event(ctx, `Searching suppliers for "${opp.title}"…`, "step_start");

    const queries = [
      `${opp.title} private label manufacturer OEM`,
      `${opp.title} wholesale supplier custom`,
    ];

    const hits: { title: string; url: string; content: string }[] = [];
    for (const q of queries) {
      try {
        const res = await searchSuppliers(q, 8);
        for (const r of res.results ?? []) {
          hits.push({ title: r.title ?? "", url: r.url ?? "", content: (r.content ?? "").slice(0, 300) });
        }
      } catch (e) {
        yield this.event(ctx, `Supplier search failed for "${q}": ${String(e)}`, "warning");
      }
    }

    let suppliers: Supplier[] = [];
    if (hits.length > 0) {
      const out = await generateJSON<z.infer<typeof SuppliersSchema>>({
        model: MODELS.extract,
        schema: SuppliersSchema,
        prompt:
          `Product to source: "${opp.title}". From these wholesale/manufacturer search results, extract a ` +
          `shortlist of up to 6 real supplier candidates with name, url, country (if inferable), likely MOQ, ` +
          `capabilities (private-label/OEM/customization), and a fitScore 0..1 for this product.\n\n` +
          hits.map((h) => `- ${h.title} | ${h.url}\n  ${h.content}`).join("\n"),
      });
      suppliers = out.suppliers ?? [];
    }

    if (suppliers.length > 0) await recordSuppliers(runId, suppliers);

    yield this.event(ctx, `Shortlisted ${suppliers.length} supplier(s)`, "step_done", {
      [STATE.suppliers]: suppliers,
    });
  }
}
