import type { Event, InvocationContext } from "@google/adk";
import { PipelineStep } from "../base-step";
import { searchDemand } from "../../adapters/tavily";
import { recordTrendObservations } from "../../db/store";
import { STATE, type DiscoveryPlan, type Evidence, type Opportunity } from "../../types";

/** Step 4 — corroborate demand for the chosen opportunity via live web search. */
export class CorroborateStep extends PipelineStep {
  protected critical = false; // degrade to empty evidence rather than abort
  constructor() {
    super("corroborate", "Validate demand and trend context on the open web");
  }

  protected async *runAsyncImpl(ctx: InvocationContext): AsyncGenerator<Event, void, void> {
    const runId = this.read<string>(ctx, STATE.runId) ?? "";
    const opp = this.read<Opportunity>(ctx, STATE.opportunity);
    const plan = this.read<DiscoveryPlan>(ctx, STATE.discoveryPlan);
    if (!opp) throw new Error("corroborate: no opportunity in state");

    yield this.event(ctx, `Validating demand for "${opp.title}"…`, "step_start");

    const queries = [`${opp.title} demand trend`, ...(plan?.webValidationQueries ?? [])].slice(0, 3);
    const evidence: Evidence = { answer: "", sources: [] };

    for (const q of queries) {
      try {
        const res = await searchDemand(q, 5);
        if (res.answer && !evidence.answer) evidence.answer = res.answer;
        for (const r of res.results ?? []) {
          evidence.sources.push({
            title: r.title ?? "",
            url: r.url ?? "",
            snippet: (r.content ?? "").slice(0, 240),
          });
        }
      } catch (e) {
        yield this.event(ctx, `Search failed for "${q}": ${String(e)}`, "warning");
      }
    }

    if (evidence.sources.length > 0) {
      await recordTrendObservations(
        runId,
        "tavily",
        evidence.sources.map((s) => ({ url: s.url, topic: s.title, payload: s })),
      );
    }

    yield this.event(
      ctx,
      `Collected ${evidence.sources.length} corroborating source(s)`,
      "step_done",
      { [STATE.evidence]: evidence },
    );
  }
}
