import { pingClickhouse, insertRows, queryJson } from "../../lib/adapters/clickhouse";
import { migrate } from "../../lib/db/migrate";

export async function run(): Promise<void> {
  if (!(await pingClickhouse())) throw new Error("ClickHouse ping failed");
  await migrate();
  const runId = "smoke_" + Date.now();
  await insertRows("run_events", [
    { run_id: runId, step: "smoke", kind: "info", message: "round-trip", data: "{}" },
  ]);
  const rows = await queryJson<{ message: string }>(
    "SELECT message FROM run_events WHERE run_id = {rid:String}",
    { rid: runId },
  );
  if (rows.length < 1) throw new Error("insert/select round-trip returned no rows");
  console.log(`  schema applied; round-trip ok (message="${rows[0].message}")`);
}
