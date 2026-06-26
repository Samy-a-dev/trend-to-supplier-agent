/** Tavily adapter — live web search/extract for demand validation + supplier discovery. */
import { tavily } from "@tavily/core";
import { env } from "../env";

let _client: ReturnType<typeof tavily> | null = null;
function client() {
  if (!_client) _client = tavily({ apiKey: env.tavilyApiKey() });
  return _client;
}

const SUPPLIER_DOMAINS = [
  "alibaba.com",
  "made-in-china.com",
  "thomasnet.com",
  "globalsources.com",
];

/** Recency-biased open-web read to validate demand / trend context. */
export function searchDemand(query: string, maxResults = 10) {
  return client().search(query, {
    searchDepth: "advanced",
    topic: "news",
    days: 30,
    maxResults,
    includeAnswer: "advanced",
    includeRawContent: "markdown",
  });
}

/** Supplier/manufacturer discovery, biased to wholesale marketplaces. */
export function searchSuppliers(query: string, maxResults = 10) {
  return client().search(query, {
    searchDepth: "advanced",
    maxResults,
    includeDomains: SUPPLIER_DOMAINS,
    includeRawContent: "markdown",
  });
}

/** Pull clean content from specific supplier/product pages. */
export function extractPages(urls: string[]) {
  return client().extract(urls, { extractDepth: "advanced", format: "markdown" });
}
