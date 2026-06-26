import type { Event, InvocationContext } from "@google/adk";
import { PipelineStep } from "../base-step";
import { searchDemand } from "../../adapters/tavily";
import { recordTrendObservations } from "../../db/store";
import { toolEvent } from "../../log";
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

    const queries = [`${opp.title} demand trend`, ...(plan?.webValidationQueries ?? [])].slice(0, 3);
    yield this.event(
      ctx,
      `Tavily · validating demand for "${opp.title}" via ${queries.length} advanced web search(es)`,
      "step_start",
      undefined,
      toolEvent("tavily", `search:demand ×${queries.length}`, {
        queries,
        searchDepth: "advanced",
        topic: "news",
        days: 30,
        maxResults: 5,
        includeAnswer: "advanced",
      }),
    );

    const evidence: Evidence = { answer: "", sources: [] };

    for (const q of queries) {
      try {
        const res = await searchDemand(q, 5);
        const found = res.results?.length ?? 0;
        const answerChars = res.answer?.length ?? 0;
        if (res.answer && !evidence.answer) evidence.answer = res.answer;
        for (const r of res.results ?? []) {
          evidence.sources.push({
            title: r.title ?? "",
            url: r.url ?? "",
            snippet: (r.content ?? "").slice(0, 240),
          });
        }
        yield this.event(
          ctx,
          `Tavily ← "${q}": ${found} source(s)${answerChars ? `, ${answerChars}-char answer` : ""}`,
          "progress",
          undefined,
          toolEvent("tavily", "result", { q, sources: found, answerChars }),
        );
      } catch (e) {
        yield this.event(ctx, `Tavily search failed for "${q}": ${String(e)}`, "warning");
      }
    }

    if (evidence.answer) {
      const preview = evidence.answer.slice(0, 200);
      yield this.event(
        ctx,
        `Tavily synthesis: ${preview}${evidence.answer.length > 200 ? "…" : ""}`,
        "progress",
        undefined,
        toolEvent("tavily", "answer", { answer: evidence.answer.slice(0, 600) }),
      );
    }

    if (evidence.sources.length > 0) {
      await recordTrendObservations(
        runId,
        "tavily",
        evidence.sources.map((s) => ({ url: s.url, topic: s.title, payload: s })),
      );
      yield this.event(
        ctx,
        `ClickHouse ← ${evidence.sources.length} row(s) → trend_observations`,
        "progress",
        undefined,
        toolEvent("clickhouse", "INSERT → trend_observations", {
          table: "trend_observations",
          rows: evidence.sources.length,
          source: "tavily",
        }),
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
