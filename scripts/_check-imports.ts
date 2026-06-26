/* Import every module so resolution + top-level code is exercised. No network/creds. */
async function main() {
  await import("../lib/env");
  await import("../lib/adapters/clickhouse");
  await import("../lib/adapters/apify");
  await import("../lib/adapters/tavily");
  await import("../lib/adapters/gemini");
  await import("../lib/adapters/prometheux");
  await import("../lib/adapters/gmail");
  await import("../lib/db/migrate");
  await import("../lib/reasoning/vadalog");
  const { buildPipeline } = await import("../lib/agent/pipeline");
  const pipeline = buildPipeline();
  const subAgents = (pipeline as { subAgents?: unknown[] }).subAgents ?? [];
  console.log(`✓ all modules import cleanly; pipeline has ${subAgents.length} steps`);
  if (subAgents.length !== 9) throw new Error(`expected 9 steps, got ${subAgents.length}`);
}

main().catch((e) => {
  console.error("✗ import failed:", e);
  process.exit(1);
});
