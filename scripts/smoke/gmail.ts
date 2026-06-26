import { createDraft } from "../../lib/adapters/gmail";

export async function run(): Promise<void> {
  const to = process.env.SMOKE_EMAIL_TO || "supplier@example.com";
  const id = await createDraft(
    to,
    "Sourcing Agent — smoke test draft",
    "This is a draft created by the sourcing agent smoke test. It was not sent.",
  );
  console.log(`  created Gmail draft id: ${id} (stays in Drafts, not sent)`);
  if (!id) throw new Error("drafts.create returned no id");
}
