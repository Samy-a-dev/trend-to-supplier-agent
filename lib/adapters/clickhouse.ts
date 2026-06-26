/** ClickHouse Cloud adapter — single shared client, typed insert/query helpers. */
import { createClient, type ClickHouseClient } from "@clickhouse/client";
import { env } from "../env";
import { toolLog } from "../log";

let _client: ClickHouseClient | null = null;

/** Collapse a multi-line SQL statement to a single trimmed line for log output. */
function oneLine(sql: string, max = 120): string {
  const s = sql.replace(/\s+/g, " ").trim();
  return s.length > max ? s.slice(0, max) + "…" : s;
}

export function clickhouse(): ClickHouseClient {
  if (_client) return _client;
  const { url, username, password } = env.clickhouse();
  _client = createClient({
    url,
    username,
    password,
    clickhouse_settings: {
      async_insert: 1,
      wait_for_async_insert: 1,
    },
  });
  return _client;
}

/** Append rows to a table (JSONEachRow). No-op on empty input. */
export async function insertRows(
  table: string,
  values: Record<string, unknown>[],
  opts: { waitForAsyncInsert?: boolean } = {},
): Promise<void> {
  if (values.length === 0) return;
  const wait = opts.waitForAsyncInsert ?? true;
  const t0 = Date.now();
  await clickhouse().insert({
    table,
    values,
    format: "JSONEachRow",
    ...(wait ? {} : { clickhouse_settings: { wait_for_async_insert: 0 } }),
  });
  toolLog("clickhouse", `INSERT → ${table}`, {
    rows: values.length,
    format: "JSONEachRow",
    async_insert: 1,
    wait_for_async_insert: wait ? 1 : 0,
    ms: Date.now() - t0,
  });
}

/** Run a SELECT with safe parameter binding and return typed rows. */
export async function queryJson<T = Record<string, unknown>>(
  query: string,
  query_params?: Record<string, unknown>,
): Promise<T[]> {
  const t0 = Date.now();
  const rs = await clickhouse().query({ query, query_params, format: "JSONEachRow" });
  const rows = await rs.json<T>();
  toolLog("clickhouse", "SELECT", {
    sql: oneLine(query),
    params: query_params ? Object.keys(query_params).length : 0,
    rows: rows.length,
    ms: Date.now() - t0,
  });
  return rows;
}

/** Execute DDL / statements that return no rows. */
export async function command(query: string): Promise<void> {
  const t0 = Date.now();
  await clickhouse().command({ query, clickhouse_settings: { wait_end_of_query: 1 } });
  toolLog("clickhouse", "COMMAND", { sql: oneLine(query), ms: Date.now() - t0 });
}

export async function pingClickhouse(): Promise<boolean> {
  const t0 = Date.now();
  const r = await clickhouse().ping();
  toolLog("clickhouse", "PING", { ok: r.success, ms: Date.now() - t0 });
  return r.success;
}
