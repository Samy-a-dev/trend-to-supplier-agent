/** Tavily adapter — live web search/extract for demand validation + supplier discovery. */
import { tavily } from "@tavily/core";
import { env } from "../env";
import { toolLog } from "../log";

let _client: ReturnType<typeof tavily> | null = null;
function client() {
  if (!_client) _client = tavily({ apiKey: env.tavilyApiKey() });
  return _client;
}

/** Wholesale / manufacturer marketplaces Tavily is restricted to for supplier discovery. */
export const SUPPLIER_DOMAINS = [
  "alibaba.com",
  "made-in-china.com",
  "thomasnet.com",
  "globalsources.com",
];

/** Tavily attaches a server-side latency on each response; surface it when present. */
const responseMs = (res: unknown): number | undefined => {
  const rt = (res as { responseTime?: unknown }).responseTime;
  const n = typeof rt === "string" ? parseFloat(rt) : typeof rt === "number" ? rt : NaN;
  return Number.isFinite(n) ? Math.round(n * 1000) : undefined;
};

/** Recency-biased open-web read to validate demand / trend context. */
export async function searchDemand(query: string, maxResults = 10) {
  const t0 = Date.now();
  const res = await client().search(query, {
    searchDepth: "advanced",
    topic: "news",
    days: 30,
    maxResults,
    includeAnswer: "advanced",
    includeRawContent: "markdown",
  });
  toolLog("tavily", "search:demand", {
    q: query,
    searchDepth: "advanced",
    topic: "news",
    days: 30,
    maxResults,
    results: res.results?.length ?? 0,
    answerChars: res.answer?.length ?? 0,
    tavilyMs: responseMs(res),
    ms: Date.now() - t0,
  });
  return res;
}

/** Supplier/manufacturer discovery, biased to wholesale marketplaces. */
export async function searchSuppliers(query: string, maxResults = 10) {
  const t0 = Date.now();
  const res = await client().search(query, {
    searchDepth: "advanced",
    maxResults,
    includeDomains: SUPPLIER_DOMAINS,
    includeRawContent: "markdown",
  });
  toolLog("tavily", "search:suppliers", {
    q: query,
    searchDepth: "advanced",
    includeDomains: SUPPLIER_DOMAINS.join(","),
    maxResults,
    results: res.results?.length ?? 0,
    tavilyMs: responseMs(res),
    ms: Date.now() - t0,
  });
  return res;
}

/** Pull clean content from specific supplier/product pages. */
export async function extractPages(urls: string[]) {
  const t0 = Date.now();
  const res = await client().extract(urls, { extractDepth: "advanced", format: "markdown" });
  toolLog("tavily", "extract", {
    urls: urls.length,
    extractDepth: "advanced",
    extracted: res.results?.length ?? 0,
    failed: res.failedResults?.length ?? 0,
    ms: Date.now() - t0,
  });
  return res;
}
