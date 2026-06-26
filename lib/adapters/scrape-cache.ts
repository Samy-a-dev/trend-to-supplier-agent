import { createHash } from "node:crypto";
import { insertRows, queryJson } from "./clickhouse";

const TTL_MS = Number(process.env.SCRAPE_CACHE_TTL_MS) || 24 * 3600_000;
const FALLBACK = (process.env.SCRAPE_CACHE_VERTICAL_FALLBACK ?? "1") !== "0";
const MAX_ITEMS_BYTES = 8_000_000;

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => stableStringify(v)).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(",")}}`;
}

export function cacheKey(slug: string, input: unknown): string {
  return createHash("sha256").update(`${slug}|${stableStringify(input)}`).digest("hex");
}

export async function readCache<T>(
  slug: string,
  vertical: string,
  source: string,
  key: string,
): Promise<T[] | null> {
  try {
    const rows = await queryJson<{ items: string }>(
      `SELECT items FROM scrape_cache FINAL
       WHERE slug = {slug:String}
         AND captured_at > subtractSeconds(now64(3), {ttl:UInt32})
         AND ( cache_key = {key:String}
               OR ({fb:UInt8} = 1 AND vertical = {v:String} AND source = {s:String}) )
       ORDER BY (cache_key = {key:String}) DESC, captured_at DESC
       LIMIT 1`,
      {
        slug,
        key,
        v: vertical,
        s: source,
        fb: FALLBACK ? 1 : 0,
        ttl: Math.floor(TTL_MS / 1000),
      },
    );
    if (!rows[0]) return null;
    return JSON.parse(rows[0].items) as T[];
  } catch (e) {
    console.warn(`[scrape-cache] read failed, continuing without cache: ${String(e)}`);
    return null;
  }
}

export async function writeCache(
  slug: string,
  vertical: string,
  source: string,
  key: string,
  items: unknown[],
): Promise<void> {
  const json = JSON.stringify(items);
  if (json.length > MAX_ITEMS_BYTES) return;
  await insertRows(
    "scrape_cache",
    [{ cache_key: key, slug, vertical, source, items: json, item_count: items.length }],
    { waitForAsyncInsert: false },
  ).catch((e) => {
    console.warn(`[scrape-cache] write failed: ${String(e)}`);
  });
}
