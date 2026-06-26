/** Approve an RFQ draft → create a real Gmail draft (never sent) + update status. */
export const runtime = "nodejs";

import { createDraft } from "@/lib/adapters/gmail";
import { getOutreach, setOutreachDrafted } from "@/lib/db/store";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { runId?: string; id?: string };
  const runId = (body.runId ?? "").trim();
  const id = (body.id ?? "").trim();
  if (!runId || !id) return Response.json({ error: "runId and id required" }, { status: 400 });

  try {
    const emails = await getOutreach(runId);
    const email = emails.find((e) => e.id === id);
    if (!email) return Response.json({ error: "email not found" }, { status: 404 });

    const draftId = await createDraft(
      email.to_email || "supplier@example.com",
      email.subject,
      email.body,
    );
    await setOutreachDrafted(runId, id, draftId);
    return Response.json({ ok: true, draftId });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
