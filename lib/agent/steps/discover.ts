import { z } from "zod";
import type { Event, InvocationContext } from "@google/adk";
import { PipelineStep } from "../base-step";
import { generateJSON, MODELS } from "../../adapters/gemini";
import { STATE, type DiscoveryPlan } from "../../types";

const PlanSchema = z.object({
  tiktokHashtags: z.array(z.string()),
  amazonQueries: z.array(z.string()),
  redditSearches: z.array(z.string()),
  webValidationQueries: z.array(z.string()),
});

/** Step 1 — turn the vertical into a concrete discovery plan. */
export class DiscoverStep extends PipelineStep {
  protected critical = true;
  constructor() {
    super("discover", "Plan discovery: hashtags, marketplace queries, subreddits, web queries");
  }

  protected async *runAsyncImpl(ctx: InvocationContext): AsyncGenerator<Event, void, void> {
    const vertical = this.read<string>(ctx, STATE.vertical) ?? "";
    yield this.event(ctx, `Planning discovery for "${vertical}"`, "step_start");

    const plan = await generateJSON<DiscoveryPlan>({
      model: MODELS.reason,
      thinking: "low",
      schema: PlanSchema,
      prompt:
        `You are a product-sourcing scout. For the market vertical "${vertical}", produce a concrete ` +
        `discovery plan to find the hottest SPECIFIC products trending right now. Return: 3-5 TikTok ` +
        `hashtags (no # symbol), 3-4 Amazon search queries, 3-4 Reddit search phrases, and 2-3 web ` +
        `search queries to validate demand. Be specific to the vertical and to buyable physical products.`,
    });

    yield this.event(
      ctx,
      `Plan ready: ${plan.tiktokHashtags.length} hashtags, ${plan.amazonQueries.length} Amazon queries, ${plan.redditSearches.length} Reddit searches`,
      "progress",
    );
    yield this.event(ctx, "Discovery plan complete", "step_done", {
      [STATE.discoveryPlan]: plan,
    });
  }
}
