import type { Event, InvocationContext } from "@google/adk";
import { PipelineStep } from "../base-step";
import { upsertOpportunity } from "../../db/store";
import {
  STATE,
  type Evidence,
  type Opportunity,
  type OutreachEmail,
  type Scores,
  type Supplier,
  type VariantConcept,
} from "../../types";

/** Step 9 — persist the final opportunity record and emit the report summary. */
export class ReportStep extends PipelineStep {
  protected critical = true;
  constructor() {
    super("report", "Assemble and persist the sourcing report");
  }

  protected async *runAsyncImpl(ctx: InvocationContext): AsyncGenerator<Event, void, void> {
    const runId = this.read<string>(ctx, STATE.runId) ?? "";
    const opp = this.read<Opportunity>(ctx, STATE.opportunity);
    if (!opp) throw new Error("report: no opportunity in state");
    const scores = this.read<Scores>(ctx, STATE.scores);
    const variant = this.read<VariantConcept>(ctx, STATE.variant);
    const suppliers = this.read<Supplier[]>(ctx, STATE.suppliers) ?? [];
    const evidence = this.read<Evidence>(ctx, STATE.evidence);
    const emails = this.read<OutreachEmail[]>(ctx, STATE.emails) ?? [];

    yield this.event(ctx, "Assembling sourcing report…", "step_start");

    await upsertOpportunity(runId, opp, scores, variant, "sourced");

    const summary = {
      product: opp.title,
      stockCandidate: scores?.stockCandidate ?? false,
      painCount: opp.painPoints.length,
      supplierCount: suppliers.length,
      imageCount: variant?.imagePaths.length ?? 0,
      emailCount: emails.length,
      evidenceSources: evidence?.sources.length ?? 0,
    };

    yield this.event(
      ctx,
      `Report ready: ${opp.title} — ${summary.supplierCount} suppliers, ${summary.emailCount} RFQ drafts, ` +
        `${summary.imageCount} concepts${summary.stockCandidate ? ", flagged STOCK CANDIDATE" : ""}`,
      "step_done",
      { report: summary },
    );
  }
}
