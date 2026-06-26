import { z } from "zod";
import type { Event, InvocationContext } from "@google/adk";
import { PipelineStep } from "../base-step";
import { generateJSON, MODELS } from "../../adapters/gemini";
import { derive } from "../../adapters/prometheux";
import { buildScoringProgram, isStockCandidate } from "../../reasoning/vadalog";
import { toolEvent } from "../../log";
import { STATE, type Evidence, type Opportunity, type RawSignals, type Scores, type Supplier } from "../../types";

const ScoreSchema = z.object({
  trendStrength: z.number(),
  demandQuality: z.number(),
  painIntensity: z.number(),
  saturation: z.number(),
  differentiation: z.number(),
  supplierFit: z.number(),
  marginPotential: z.number(),
  sourcingRisk: z.number(),
});

const clamp01 = (n: number) => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));

/** Step 6 — symbolic reasoning (Prometheux) + numeric scoring (Gemini). */
export class ScoreStep extends PipelineStep {
  protected critical = false;
  constructor() {
    super("score", "Score the opportunity (Prometheux reasoning + numeric axes)");
  }

  protected async *runAsyncImpl(ctx: InvocationContext): AsyncGenerator<Event, void, void> {
    const opp = this.read<Opportunity>(ctx, STATE.opportunity);
    if (!opp) throw new Error("score: no opportunity in state");
    const evidence = this.read<Evidence>(ctx, STATE.evidence);
    const suppliers = this.read<Supplier[]>(ctx, STATE.suppliers) ?? [];
    const signals = this.read<RawSignals>(ctx, STATE.rawSignals);

    yield this.event(ctx, "Scoring opportunity…", "step_start");

    // Signal-derived facts for the reasoning program.
    const platformCount =
      (signals && signals.tiktok.length > 0 ? 1 : 0) +
      (signals && signals.amazonProducts.length > 0 ? 1 : 0) +
      (signals && signals.reddit.length > 0 ? 1 : 0) +
      ((evidence?.sources.length ?? 0) > 0 ? 1 : 0);
    const totalSignals =
      (signals?.tiktok.length ?? 0) + (signals?.amazonProducts.length ?? 0) + (signals?.reddit.length ?? 0);
    const growth = clamp01(0.4 + totalSignals / 100);

    // 1) Symbolic reasoning via Prometheux (the real engine).
    let stockCandidate = false;
    let derived: unknown = null;
    const { program, output, factLines, ruleLines } = buildScoringProgram({
      product: opp.product,
      growth,
      platformCount,
      pains: opp.painPoints,
      competitors: opp.competitors,
      suppliers,
    });

    yield this.event(
      ctx,
      `Prometheux · evaluating Vadalog program — ${factLines.length} facts, ${ruleLines.length} rules → @output(${output})`,
      "progress",
      undefined,
      toolEvent("prometheux", "derive:stockCandidate", {
        engine: "Vadalog",
        output,
        facts: factLines.length,
        rules: ruleLines.length,
        program,
      }),
    );

    try {
      const res = await derive({ program, output_predicate: output });
      derived = res.results;
      stockCandidate = isStockCandidate(res.results, opp.product);
      yield this.event(
        ctx,
        `Prometheux ⊢ stockCandidate(${opp.product}) = ${stockCandidate}`,
        "progress",
        undefined,
        toolEvent("prometheux", "result", {
          output,
          stockCandidate,
          project_id: res.project_id,
        }),
      );
    } catch (e) {
      yield this.event(ctx, `Prometheux unavailable, scoring without it: ${String(e)}`, "warning");
    }

    // 2) Numeric axes via Gemini.
    const axes = await generateJSON<z.infer<typeof ScoreSchema>>({
      model: MODELS.reason,
      thinking: "low",
      schema: ScoreSchema,
      prompt:
        `Rate this product opportunity on each axis from 0.0 to 1.0.\n` +
        `Product: ${opp.title}\nSummary: ${opp.summary}\n` +
        `Pain points: ${opp.painPoints.map((p) => p.pain).join("; ")}\n` +
        `Competitor weaknesses: ${opp.competitors.map((c) => c.weakness).join("; ")}\n` +
        `Suppliers found: ${suppliers.length}\nDemand evidence: ${evidence?.answer?.slice(0, 400) ?? "n/a"}\n\n` +
        `Axes: trendStrength, demandQuality, painIntensity, saturation (higher = more crowded/worse), ` +
        `differentiation, supplierFit, marginPotential, sourcingRisk (higher = riskier).`,
    });

    const scores: Scores = {
      trendStrength: clamp01(axes.trendStrength),
      demandQuality: clamp01(axes.demandQuality),
      painIntensity: clamp01(axes.painIntensity),
      saturation: clamp01(axes.saturation),
      differentiation: clamp01(axes.differentiation),
      supplierFit: clamp01(axes.supplierFit),
      marginPotential: clamp01(axes.marginPotential),
      sourcingRisk: clamp01(axes.sourcingRisk),
      stockCandidate,
      derived,
    };

    yield this.event(
      ctx,
      `Scored: trend ${scores.trendStrength.toFixed(2)}, differentiation ${scores.differentiation.toFixed(2)}, stockCandidate=${stockCandidate}`,
      "step_done",
      { [STATE.scores]: scores },
    );
  }
}
