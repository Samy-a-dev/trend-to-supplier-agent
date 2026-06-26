/**
 * Apify adapter — typed wrappers per actor with live-run caps + SUCCEEDED checks.
 * Actors and input fields verified against the Apify Store (June 2026).
 */
import { ApifyClient } from "apify-client";
import { env } from "../env";
import { cacheKey, readCache, writeCache } from "./scrape-cache";

export type CacheCtx = { vertical: string; bypass?: boolean };

// Token failover: start on the primary token and, the first time we hit a
// credit/usage-limit error, switch permanently (for this process) to the backup
// token if one is configured. Lazy so a missing APIFY_TOKEN only throws on use.
let _tokens: string[] | null = null;
let _tokenIdx = 0;
let _client: ApifyClient | null = null;

function tokens(): string[] {
  if (!_tokens)
    _tokens = [env.apifyToken(), env.apifyTokenBackup(), env.apifyTokenBackup2()].filter(Boolean);
  return _tokens;
}

function apify(): ApifyClient {
  if (!_client) _client = new ApifyClient({ token: tokens()[_tokenIdx] });
  return _client;
}

/** True when an error looks like the account is out of Apify credits / over its usage limit. */
function isCreditError(e: unknown): boolean {
  const msg = String((e as { message?: unknown })?.message ?? e).toLowerCase();
  return /\b(limit|credit|quota|usage|payment|insufficient|exceeded|402)\b/.test(msg);
}

/** Switch to the next configured token. Returns false if there's no backup left. */
function failoverToken(): boolean {
  if (_tokenIdx + 1 < tokens().length) {
    _tokenIdx++;
    _client = null; // rebuilt lazily with the backup token
    console.warn(`[apify] primary token out of credits — failing over to backup token #${_tokenIdx}`);
    return true;
  }
  return false;
}

async function runActor<T = Record<string, unknown>>(
  slug: string,
  input: Record<string, unknown>,
  opts: { limit?: number; waitSecs?: number; memory?: number } = {},
): Promise<T[]> {
  const { limit = 50, waitSecs = 120, memory = 1024 } = opts;
  const exec = async (): Promise<T[]> => {
    const run = await apify().actor(slug).call(input, { waitSecs, memory });
    if (run.status !== "SUCCEEDED") {
      throw new Error(`Apify actor ${slug} did not succeed (status=${run.status}).`);
    }
    const { items } = await apify().dataset(run.defaultDatasetId).listItems({ limit, clean: true });
    return items as T[];
  };
  try {
    return await exec();
  } catch (e) {
    if (isCreditError(e) && failoverToken()) return await exec();
    throw e;
  }
}

async function cachedRunActor<T = Record<string, unknown>>(
  slug: string,
  input: Record<string, unknown>,
  opts: { limit?: number; waitSecs?: number; memory?: number },
  source: string,
  cc?: CacheCtx,
): Promise<T[]> {
  const key = cacheKey(slug, input);
  if (cc && !cc.bypass) {
    const hit = await readCache<T>(slug, cc.vertical, source, key);
    if (hit) {
      console.log(`[apify] cache hit ${source} (${hit.length} items)`);
      return hit;
    }
  }
  const items = await runActor<T>(slug, input, opts);
  if (cc) await writeCache(slug, cc.vertical, source, key, items);
  return items;
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

export function scrapeTikTok(hashtags: string[], resultsPerPage = 20, cc?: CacheCtx) {
  return withRetry(() =>
    cachedRunActor(
      "clockworks/tiktok-scraper",
      { hashtags, resultsPerPage, commentsPerPost: 0, proxyCountryCode: "None" },
      { limit: resultsPerPage * Math.max(1, hashtags.length) },
      "tiktok",
      cc,
    ),
  );
}

export function scrapeAmazonProducts(
  searchUrls: string[],
  maxItemsPerStartUrl = 15,
  cc?: CacheCtx,
) {
  // Single attempt (no retry): Amazon detail-page crawling is slow + expensive, and
  // the ingest step already tolerates a missing source. Give it a long wait so the
  // crawl finishes within the window instead of timing out → throwing → re-running.
  return cachedRunActor(
    "junglee/amazon-crawler",
    {
      categoryOrProductUrls: searchUrls.map((url) => ({ url })),
      maxItemsPerStartUrl,
      maxSearchPagesPerStartUrl: 1,
      proxyCountry: "AUTO_SELECT_PROXY_COUNTRY",
    },
    { limit: maxItemsPerStartUrl * Math.max(1, searchUrls.length), waitSecs: 240, memory: 2048 },
    "amazon",
    cc,
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

export function scrapeReddit(searches: string[], maxItems = 30, cc?: CacheCtx) {
  return withRetry(() =>
    cachedRunActor(
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
      "reddit",
      cc,
    ),
  );
}
