/**
 * Apify adapter — typed wrappers per actor with live-run caps + SUCCEEDED checks.
 * Actors and input fields verified against the Apify Store (June 2026).
 */
import { ApifyClient } from "apify-client";
import { env } from "../env";

let _client: ApifyClient | null = null;
function apify(): ApifyClient {
  if (!_client) _client = new ApifyClient({ token: env.apifyToken() });
  return _client;
}

async function runActor<T = Record<string, unknown>>(
  slug: string,
  input: Record<string, unknown>,
  opts: { limit?: number; waitSecs?: number; memory?: number } = {},
): Promise<T[]> {
  const { limit = 50, waitSecs = 120, memory = 1024 } = opts;
  const run = await apify().actor(slug).call(input, { waitSecs, memory });
  if (run.status !== "SUCCEEDED") {
    throw new Error(`Apify actor ${slug} did not succeed (status=${run.status}).`);
  }
  const { items } = await apify().dataset(run.defaultDatasetId).listItems({ limit, clean: true });
  return items as T[];
}

/** Retry wrapper for flaky scrapers. */
async function withRetry<T>(fn: () => Promise<T>, attempts = 2): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

export function scrapeTikTok(hashtags: string[], resultsPerPage = 20) {
  return withRetry(() =>
    runActor(
      "clockworks/tiktok-scraper",
      { hashtags, resultsPerPage, commentsPerPost: 0, proxyCountryCode: "None" },
      { limit: resultsPerPage * Math.max(1, hashtags.length) },
    ),
  );
}

export function scrapeAmazonProducts(searchUrls: string[], maxItemsPerStartUrl = 15) {
  // Single attempt (no retry): Amazon detail-page crawling is slow + expensive, and
  // the ingest step already tolerates a missing source. Give it a long wait so the
  // crawl finishes within the window instead of timing out → throwing → re-running.
  return runActor(
    "junglee/amazon-crawler",
    {
      categoryOrProductUrls: searchUrls.map((url) => ({ url })),
      maxItemsPerStartUrl,
      maxSearchPagesPerStartUrl: 1,
      proxyCountry: "AUTO_SELECT_PROXY_COUNTRY",
    },
    { limit: maxItemsPerStartUrl * Math.max(1, searchUrls.length), waitSecs: 240, memory: 2048 },
  );
}

/**
 * Amazon reviews. The junglee reviews actor is flaky (2.3★, under maintenance),
 * so this is resilient: on failure it returns [] and logs, rather than aborting
 * the run. Reviews are enrichment — pain points also come from Reddit/TikTok.
 * (Axesso fallback wiring is confirmed against its live input schema in M0.)
 */
export async function scrapeAmazonReviews(
  productUrls: string[],
  maxReviews = 50,
): Promise<Record<string, unknown>[]> {
  if (productUrls.length === 0) return [];
  try {
    return await runActor(
      "junglee/amazon-reviews-scraper",
      {
        productUrls: productUrls.map((url) => ({ url })),
        maxReviews,
        sort: "helpful",
        filterByRatings: ["allStars"],
      },
      { limit: maxReviews * productUrls.length },
    );
  } catch (e) {
    console.warn(`[apify] Amazon reviews scrape failed, continuing without reviews: ${String(e)}`);
    return [];
  }
}

export function scrapeReddit(searches: string[], maxItems = 30) {
  return withRetry(() =>
    runActor(
      "trudax/reddit-scraper-lite",
      {
        searches,
        sort: "top",
        maxItems,
        maxPostCount: 10,
        maxComments: 10,
        skipComments: false,
        proxy: { useApifyProxy: true },
      },
      { limit: maxItems },
    ),
  );
}
