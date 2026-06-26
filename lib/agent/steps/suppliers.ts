import { z } from "zod";
import type { Event, InvocationContext } from "@google/adk";
import { PipelineStep } from "../base-step";
import { searchSuppliers, SUPPLIER_DOMAINS } from "../../adapters/tavily";
import { generateJSON, MODELS } from "../../adapters/gemini";
import { recordSuppliers } from "../../db/store";
import { toolEvent } from "../../log";
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

    const queries = [
      `${opp.title} private label manufacturer OEM`,
      `${opp.title} wholesale supplier custom`,
    ];
    yield this.event(
      ctx,
      `Tavily · discovering suppliers across ${SUPPLIER_DOMAINS.length} wholesale marketplaces`,
      "step_start",
      undefined,
      toolEvent("tavily", `search:suppliers ×${queries.length}`, {
        queries,
        searchDepth: "advanced",
        includeDomains: SUPPLIER_DOMAINS,
        maxResults: 8,
      }),
    );

    const hits: { title: string; url: string; content: string }[] = [];
    const settled = await Promise.allSettled(queries.map((q) => searchSuppliers(q, 8)));

    for (let i = 0; i < queries.length; i++) {
      const q = queries[i];
      const result = settled[i];
      if (result.status === "fulfilled") {
        const res = result.value;
        const found = res.results?.length ?? 0;
        for (const r of res.results ?? []) {
          hits.push({ title: r.title ?? "", url: r.url ?? "", content: (r.content ?? "").slice(0, 300) });
        }
        yield this.event(
          ctx,
          `Tavily ← "${q}": ${found} marketplace hit(s)`,
          "progress",
          undefined,
          toolEvent("tavily", "result", { q, hits: found }),
        );
      } else {
        yield this.event(
          ctx,
          `Tavily supplier search failed for "${q}": ${String(result.reason)}`,
          "warning",
        );
      }
    }

    let suppliers: Supplier[] = [];
    if (hits.length > 0) {
      yield this.event(
        ctx,
        `Gemini · shortlisting suppliers from ${hits.length} marketplace result(s)`,
        "progress",
        undefined,
        toolEvent("gemini", "extract:suppliers", { model: MODELS.extract, inputHits: hits.length }),
      );
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

    if (suppliers.length > 0) {
      await recordSuppliers(runId, suppliers);
      yield this.event(
        ctx,
        `ClickHouse ← ${suppliers.length} row(s) → supplier_candidates`,
        "progress",
        undefined,
        toolEvent("clickhouse", "INSERT → supplier_candidates", {
          table: "supplier_candidates",
          rows: suppliers.length,
        }),
      );
    }

    yield this.event(ctx, `Shortlisted ${suppliers.length} supplier(s)`, "step_done", {
      [STATE.suppliers]: suppliers,
    });
  }
}
