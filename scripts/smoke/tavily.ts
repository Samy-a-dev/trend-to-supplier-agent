import { searchDemand } from "../../lib/adapters/tavily";

export async function run(): Promise<void> {
  const res = await searchDemand("under-desk walking pad treadmill demand", 3);
  const n = res.results?.length ?? 0;
  console.log(`  tavily returned ${n} result(s)`);
  if (res.answer) console.log(`  answer: ${res.answer.slice(0, 100)}…`);
  if (n === 0) throw new Error("Tavily returned 0 results");
}
