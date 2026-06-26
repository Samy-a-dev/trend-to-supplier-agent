import { z } from "zod";
import type { Event, InvocationContext } from "@google/adk";
import { PipelineStep } from "../base-step";
import { generateJSON, MODELS } from "../../adapters/gemini";
import { recordReviewInsights, recordPainPoints, recordCompetitors } from "../../db/store";
import { toolEvent } from "../../log";
import { STATE, type Opportunity, type RawSignals } from "../../types";

const OppSchema = z.object({
  product: z.string(),
  title: z.string(),
  summary: z.string(),
  rationale: z.string(),
  priceLowCents: z.number(),
  priceHighCents: z.number(),
  painPoints: z.array(
    z.object({
      product: z.string(),
      pain: z.string(),
      severity: z.number(),
      evidenceCount: z.number(),
    }),
  ),
  competitors: z.array(
    z.object({
      product: z.string(),
      competitor: z.string(),
      weakness: z.string(),
      url: z.string().optional(),
    }),
  ),
  reviewInsights: z.array(
    z.object({
      product: z.string(),
      theme: z.string(),
      sentiment: z.enum(["positive", "negative", "neutral"]),
      frequency: z.number(),
    }),
  ),
});

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const str = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));

function compact(signals: RawSignals): string {
  const amazon = signals.amazonProducts
    .slice(0, 20)
    .map((p) => `- ${str(p.title ?? p.name)} | $${str(p.price)} | ${str(p.stars ?? p.rating)}★ | ${str(p.reviewsCount ?? p.reviews)} reviews`)
    .join("\n");
  const tiktok = signals.tiktok
    .slice(0, 20)
    .map((t) => `- ${str(t.text).slice(0, 160)}`)
    .join("\n");
  const reddit = signals.reddit
    .slice(0, 20)
    .map((r) => `- ${str(r.title).slice(0, 120)} :: ${str(r.body).slice(0, 160)}`)
    .join("\n");
  return `AMAZON PRODUCTS:\n${amazon}\n\nTIKTOK:\n${tiktok}\n\nREDDIT:\n${reddit}`;
}

/** Step 3 — extract the single best product opportunity + pains/competitors/reviews. */
export class ExtractStep extends PipelineStep {
  protected critical = true;
  constructor() {
    super("extract", "Extract the top product opportunity and customer pain points");
  }

  protected async *runAsyncImpl(ctx: InvocationContext): AsyncGenerator<Event, void, void> {
    const runId = this.read<string>(ctx, STATE.runId) ?? "";
    const vertical = this.read<string>(ctx, STATE.vertical) ?? "";
    const signals = this.read<RawSignals>(ctx, STATE.rawSignals);
    if (!signals) throw new Error("extract: no raw signals in state");

    yield this.event(ctx, "Analyzing signals to select the top opportunity…", "step_start");

    const opp = (await generateJSON<z.infer<typeof OppSchema>>({
      model: MODELS.reason,
      thinking: "medium",
      schema: OppSchema,
      prompt:
        `Vertical: "${vertical}".\n\nBelow are live scraped signals. Identify the SINGLE best specific ` +
        `product opportunity to private-label: rising demand + clear, fixable customer pain + weak ` +
        `differentiation among current sellers. Return:\n` +
        `- product: a short snake_case key (e.g. "compact_walking_pad")\n` +
        `- title, summary, rationale (why it's trending + why it's a good bet)\n` +
        `- priceLowCents/priceHighCents: observed market price range in cents\n` +
        `- painPoints: recurring complaints with severity 0..1 and evidenceCount\n` +
        `- competitors: current sellers and their specific weaknesses\n` +
        `- reviewInsights: recurring review themes with sentiment and frequency\n\n` +
        `SIGNALS:\n${compact(signals)}`,
    })) as Opportunity;

    opp.painPoints = (opp.painPoints ?? []).map((p) => ({ ...p, severity: clamp01(p.severity) }));

    // allSettled keeps a persistence blip from aborting this critical step. Report only
    // the rows that actually landed — a rejected insert contributes 0, never a false claim.
    const inserts = await Promise.allSettled([
      recordReviewInsights(runId, opp.reviewInsights ?? []),
      recordPainPoints(runId, opp.painPoints ?? []),
      recordCompetitors(runId, opp.competitors ?? []),
    ]);
    const ri = inserts[0].status === "fulfilled" ? opp.reviewInsights?.length ?? 0 : 0;
    const pp = inserts[1].status === "fulfilled" ? opp.painPoints?.length ?? 0 : 0;
    const cp = inserts[2].status === "fulfilled" ? opp.competitors?.length ?? 0 : 0;
    const failed = inserts.filter((r) => r.status === "rejected").length;

    yield this.event(
      ctx,
      `ClickHouse ← review_insights=${ri}, customer_pain_points=${pp}, competitor_products=${cp}` +
        (failed ? ` (${failed} insert(s) failed)` : ""),
      failed ? "warning" : "progress",
      undefined,
      toolEvent("clickhouse", "INSERT → review_insights, customer_pain_points, competitor_products", {
        review_insights: ri,
        customer_pain_points: pp,
        competitor_products: cp,
        failed,
      }),
    );

    yield this.event(
      ctx,
      `Top opportunity: ${opp.title} — ${opp.painPoints.length} pains, ${opp.competitors.length} competitor gaps`,
      "progress",
    );
    yield this.event(ctx, "Opportunity selected", "step_done", { [STATE.opportunity]: opp });
  }
}
