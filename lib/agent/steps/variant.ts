import { z } from "zod";
import type { Event, InvocationContext } from "@google/adk";
import { PipelineStep } from "../base-step";
import { generateJSON, generateImage, MODELS } from "../../adapters/gemini";
import { STATE, type Opportunity, type Scores, type VariantConcept } from "../../types";

const SpecSchema = z.object({
  name: z.string(),
  spec: z.string(),
  features: z.array(z.string()),
  colorways: z.array(z.string()),
});

/** Step 7 — design a differentiated variant and render a Nano Banana concept set. */
export class VariantStep extends PipelineStep {
  protected critical = false;
  constructor() {
    super("variant", "Design the differentiated variant + generate concept images");
  }

  protected async *runAsyncImpl(ctx: InvocationContext): AsyncGenerator<Event, void, void> {
    const runId = this.read<string>(ctx, STATE.runId) ?? "run";
    const opp = this.read<Opportunity>(ctx, STATE.opportunity);
    if (!opp) throw new Error("variant: no opportunity in state");
    const scores = this.read<Scores>(ctx, STATE.scores);

    yield this.event(ctx, "Designing the differentiated variant…", "step_start");

    const spec = await generateJSON<z.infer<typeof SpecSchema>>({
      model: MODELS.reason,
      thinking: "medium",
      schema: SpecSchema,
      prompt:
        `Design a differentiated private-label version of "${opp.title}" that directly fixes these pains: ` +
        `${opp.painPoints.map((p) => p.pain).join("; ")}. Competitor weaknesses to beat: ` +
        `${opp.competitors.map((c) => c.weakness).join("; ")}. Return a product name, a concise spec ` +
        `paragraph, a list of differentiating features, and 3 neutral colorway names.`,
    });

    yield this.event(ctx, `Variant: ${spec.name} (${spec.features.length} features)`, "progress");

    // Render a concept set. Each image is best-effort.
    const jobs: { label: string; model: string; aspect: string; prompt: string; file: string }[] = [
      {
        label: "hero",
        model: MODELS.imagePro,
        aspect: "1:1",
        file: `${runId}-hero.png`,
        prompt: `Studio product photograph of "${spec.name}": ${spec.spec}. Clean minimalist background, premium e-commerce hero shot.`,
      },
      {
        label: "packaging",
        model: MODELS.imagePro,
        aspect: "4:5",
        file: `${runId}-packaging.png`,
        prompt: `Retail packaging / box mockup for "${spec.name}", neutral premium branding, clear product name on the box, studio lighting.`,
      },
      {
        label: "lifestyle",
        model: MODELS.imageFast,
        aspect: "16:9",
        file: `${runId}-lifestyle.png`,
        prompt: `Lifestyle in-context photo of "${spec.name}" being used in a tidy modern home, natural light.`,
      },
    ];

    const imagePaths: string[] = [];
    const results = await Promise.allSettled(
      jobs.map((j) =>
        generateImage({
          prompt: j.prompt,
          outPath: `public/generated/${j.file}`,
          model: j.model,
          aspectRatio: j.aspect,
          imageSize: "2K",
        }).then((written) => "/" + written.replace(/^public\//, "")),
      ),
    );
    results.forEach((r, i) => {
      if (r.status === "fulfilled") {
        imagePaths.push(r.value);
      } else {
        // emit handled below as a single summary to keep the generator simple
        console.warn(`[variant] ${jobs[i].label} image failed: ${String(r.reason)}`);
      }
    });

    yield this.event(ctx, `Rendered ${imagePaths.length}/${jobs.length} concept image(s)`, "progress");

    const variant: VariantConcept = {
      name: spec.name,
      spec: spec.spec,
      features: spec.features,
      colorways: spec.colorways,
      imagePaths,
    };
    void scores; // reserved for score-driven prompt tuning
    yield this.event(ctx, "Variant concept ready", "step_done", { [STATE.variant]: variant });
  }
}
