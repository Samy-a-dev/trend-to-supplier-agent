/** ClickHouse Cloud adapter — single shared client, typed insert/query helpers. */
import { createClient, type ClickHouseClient } from "@clickhouse/client";
import { env } from "../env";

let _client: ClickHouseClient | null = null;

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
): Promise<void> {
  if (values.length === 0) return;
  await clickhouse().insert({ table, values, format: "JSONEachRow" });
}

/** Run a SELECT with safe parameter binding and return typed rows. */
export async function queryJson<T = Record<string, unknown>>(
  query: string,
  query_params?: Record<string, unknown>,
): Promise<T[]> {
  const rs = await clickhouse().query({ query, query_params, format: "JSONEachRow" });
  return rs.json<T>();
}

/** Execute DDL / statements that return no rows. */
export async function command(query: string): Promise<void> {
  await clickhouse().command({ query, clickhouse_settings: { wait_end_of_query: 1 } });
}

export async function pingClickhouse(): Promise<boolean> {
  const r = await clickhouse().ping();
  return r.success;
}
