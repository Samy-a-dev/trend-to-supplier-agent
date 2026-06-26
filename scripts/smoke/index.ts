/**
 * M0 smoke gate — runs one real call per integration. Continues on failure so you
 * see the full picture. Usage:
 *   pnpm smoke                 # all
 *   pnpm smoke gemini tavily   # subset
 */
import * as clickhouse from "./clickhouse";
import * as apify from "./apify";
import * as tavily from "./tavily";
import * as gemini from "./gemini";
import * as prometheux from "./prometheux";
import * as gmail from "./gmail";

const runners: Record<string, { run: () => Promise<void> }> = {
  clickhouse,
  apify,
  tavily,
  gemini,
  prometheux,
  gmail,
};

async function main() {
  const requested = process.argv.slice(2).filter((a) => a in runners);
  const targets = requested.length ? requested : Object.keys(runners);

  let failures = 0;
  for (const name of targets) {
    console.log(`\n▶ ${name}`);
    try {
      await runners[name].run();
      console.log(`✓ ${name} OK`);
    } catch (e) {
      failures++;
      console.error(`✗ ${name} FAILED: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  console.log(`\n${targets.length - failures}/${targets.length} integrations passed`);
  process.exit(failures ? 1 : 0);
}

main();
