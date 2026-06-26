import { scrapeReddit } from "../../lib/adapters/apify";

export async function run(): Promise<void> {
  // Reddit-lite is the most reliable/cheap actor — small cap for a fast real run.
  const items = await scrapeReddit(["wireless earbuds"], 5);
  console.log(`  reddit actor returned ${items.length} item(s)`);
  if (items.length === 0) throw new Error("Apify run succeeded but returned 0 items");
}
