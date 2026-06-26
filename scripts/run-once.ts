/* Run the full pipeline once from the CLI and print streamed events. */
import { runPipeline } from "../lib/agent/runner";

async function main() {
  const vertical = process.argv.slice(2).join(" ").trim() || "home fitness";
  const runId = `run_${Date.now()}`;
  console.log(`▶ vertical="${vertical}" runId=${runId}\n`);
  for await (const ev of runPipeline({ runId, vertical, region: "US" })) {
    const tag = `${ev.kind}`.padEnd(11);
    console.log(`[${(ev.step || "").padEnd(11)}] ${tag} ${ev.message}`);
  }
  console.log(`\n✓ finished. runId=${runId}`);
  process.exit(0);
}

main().catch((e) => {
  console.error("run failed:", e);
  process.exit(1);
});
