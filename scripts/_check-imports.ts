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
  const leafCount = (agent: unknown): number => {
    const children = (agent as { subAgents?: unknown[] }).subAgents ?? [];
    return children.length === 0
      ? 1
      : children.reduce<number>((n, child) => n + leafCount(child), 0);
  };
  const leaves = subAgents.reduce<number>((n, agent) => n + leafCount(agent), 0);
  console.log(
    `✓ all modules import cleanly; pipeline has ${subAgents.length} top-level step(s), ${leaves} leaf step(s)`,
  );
  if (leaves !== 9) throw new Error(`expected 9 leaf steps, got ${leaves}`);
}

main().catch((e) => {
  console.error("✗ import failed:", e);
  process.exit(1);
});
