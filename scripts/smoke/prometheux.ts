import { derive, sidecarHealth } from "../../lib/adapters/prometheux";

export async function run(): Promise<void> {
  if (!(await sidecarHealth())) {
    throw new Error("sidecar /health unreachable — start it with `pnpm sidecar`");
  }
  // Canonical README example: derive locations from companies.
  const program = [
    'company("Apple", "Redwood City, CA").',
    'company("Google", "Mountain View, CA").',
    "location(L) :- company(_, L).",
    '@output("location").',
  ].join("\n");

  const res = await derive({ program, output_predicate: "location" });
  // Print the RAW shape — this is how the normalizer for step 4 is written to fact.
  console.log("  raw fetch_results shape:");
  console.log("  " + JSON.stringify(res.results).slice(0, 600));
}
