/** Assembles the 9-step sourcing pipeline as an ADK SequentialAgent. */
import { ParallelAgent, SequentialAgent } from "@google/adk";
import { DiscoverStep } from "./steps/discover";
import { IngestStep } from "./steps/ingest";
import { ExtractStep } from "./steps/extract";
import { CorroborateStep } from "./steps/corroborate";
import { SuppliersStep } from "./steps/suppliers";
import { ScoreStep } from "./steps/score";
import { VariantStep } from "./steps/variant";
import { DraftStep } from "./steps/draft";
import { ReportStep } from "./steps/report";

export function buildPipeline(): SequentialAgent {
  return new SequentialAgent({
    name: "sourcing_pipeline",
    description: "Trend-to-supplier sourcing pipeline",
    // Order: suppliers precede scoring so supplier-fit is computed from real candidates.
    subAgents: [
      new DiscoverStep(),
      new IngestStep(),
      new ExtractStep(),
      new ParallelAgent({
        name: "validate_and_source",
        description: "Corroborate demand and discover suppliers concurrently",
        subAgents: [new CorroborateStep(), new SuppliersStep()],
      }),
      new ScoreStep(),
      new VariantStep(),
      new DraftStep(),
      new ReportStep(),
    ],
  });
}
