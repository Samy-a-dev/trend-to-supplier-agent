import type { Event, InvocationContext } from "@google/adk";
import { PipelineStep } from "../base-step";
import { scrapeTikTok, scrapeAmazonProducts, scrapeReddit } from "../../adapters/apify";
import { recordTrendObservations, recordMarketplaceListings } from "../../db/store";
import { toolEvent } from "../../log";
import { STATE, type DiscoveryPlan, type RawSignals } from "../../types";

const num = (v: unknown): number => {
  const n = typeof v === "string" ? parseFloat(v.replace(/[^0-9.]/g, "")) : Number(v);
  return Number.isFinite(n) ? n : 0;
};
const str = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));

/** Step 2 — scrape TikTok / Amazon / Reddit in parallel, persist raw signals. */
export class IngestStep extends PipelineStep {
  protected critical = true;
  constructor() {
    super("ingest", "Scrape TikTok, Amazon, and Reddit for live signals");
  }

  protected async *runAsyncImpl(ctx: InvocationContext): AsyncGenerator<Event, void, void> {
    const runId = this.read<string>(ctx, STATE.runId) ?? "";
    const vertical = this.read<string>(ctx, STATE.vertical) ?? "";
    const fresh = this.read<boolean>(ctx, STATE.freshScrape) ?? false;
    const plan = this.read<DiscoveryPlan>(ctx, STATE.discoveryPlan);
    if (!plan) throw new Error("ingest: no discovery plan in state");

    yield this.event(ctx, "Scraping TikTok, Amazon, and Reddit…", "step_start");

    const amazonUrls = plan.amazonQueries.map(
      (q) => `https://www.amazon.com/s?k=${encodeURIComponent(q)}`,
    );
    const cacheCtx = { vertical, bypass: fresh };

    const [tiktok, amazon, reddit] = await Promise.allSettled([
      scrapeTikTok(plan.tiktokHashtags.slice(0, 4), 20, cacheCtx),
      scrapeAmazonProducts(amazonUrls.slice(0, 2), 15, cacheCtx),
      scrapeReddit(plan.redditSearches.slice(0, 3), 30, cacheCtx),
    ]);

    const signals: RawSignals = { tiktok: [], amazonProducts: [], amazonReviews: [], reddit: [] };

    if (tiktok.status === "fulfilled") {
      signals.tiktok = tiktok.value;
      yield this.event(
        ctx,
        `Apify ← TikTok: ${tiktok.value.length} posts`,
        "progress",
        undefined,
        toolEvent("apify", "scrape:tiktok", { posts: tiktok.value.length }),
      );
      await recordTrendObservations(
        runId,
        "tiktok",
        tiktok.value.map((it) => ({
          url: str(it.webVideoUrl ?? it.postPage ?? it.url),
          topic: str(it.text ?? it.hashtags),
          payload: it,
        })),
      );
      yield this.event(
        ctx,
        `ClickHouse ← ${tiktok.value.length} row(s) → trend_observations`,
        "progress",
        undefined,
        toolEvent("clickhouse", "INSERT → trend_observations", {
          table: "trend_observations",
          rows: tiktok.value.length,
          source: "tiktok",
        }),
      );
    } else {
      yield this.event(ctx, `TikTok scrape failed: ${String(tiktok.reason)}`, "warning");
    }

    if (amazon.status === "fulfilled") {
      signals.amazonProducts = amazon.value;
      yield this.event(
        ctx,
        `Apify ← Amazon: ${amazon.value.length} products`,
        "progress",
        undefined,
        toolEvent("apify", "scrape:amazon", { products: amazon.value.length }),
      );
      await recordMarketplaceListings(
        runId,
        "amazon",
        amazon.value.map((it) => ({
          url: str(it.url),
          product: str(it.title ?? it.name),
          asin: str(it.asin),
          priceCents: Math.round(num(it.price ?? (it as { price?: { value?: number } }).price?.value) * 100),
          rating: num(it.stars ?? it.rating),
          reviewCount: num(it.reviewsCount ?? it.reviews),
          payload: it,
        })),
      );
      yield this.event(
        ctx,
        `ClickHouse ← ${amazon.value.length} row(s) → marketplace_listings`,
        "progress",
        undefined,
        toolEvent("clickhouse", "INSERT → marketplace_listings", {
          table: "marketplace_listings",
          rows: amazon.value.length,
          source: "amazon",
        }),
      );
    } else {
      yield this.event(ctx, `Amazon scrape failed: ${String(amazon.reason)}`, "warning");
    }

    if (reddit.status === "fulfilled") {
      signals.reddit = reddit.value;
      yield this.event(
        ctx,
        `Apify ← Reddit: ${reddit.value.length} items`,
        "progress",
        undefined,
        toolEvent("apify", "scrape:reddit", { items: reddit.value.length }),
      );
      await recordTrendObservations(
        runId,
        "reddit",
        reddit.value.map((it) => ({
          url: str(it.url ?? it.link),
          topic: str(it.title ?? it.body),
          payload: it,
        })),
      );
      yield this.event(
        ctx,
        `ClickHouse ← ${reddit.value.length} row(s) → trend_observations`,
        "progress",
        undefined,
        toolEvent("clickhouse", "INSERT → trend_observations", {
          table: "trend_observations",
          rows: reddit.value.length,
          source: "reddit",
        }),
      );
    } else {
      yield this.event(ctx, `Reddit scrape failed: ${String(reddit.reason)}`, "warning");
    }

    const total = signals.tiktok.length + signals.amazonProducts.length + signals.reddit.length;
    if (total === 0) throw new Error("ingest: all sources returned no data");

    yield this.event(ctx, `Ingested ${total} signals across sources`, "step_done", {
      [STATE.rawSignals]: signals,
    });
  }
}
