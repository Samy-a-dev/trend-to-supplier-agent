/** Returns the persisted detail for a past run (for replay / non-live viewing). */
export const runtime = "nodejs";

import { getRun, getRunEvents, getOpportunity, getSuppliers, getOutreach } from "@/lib/db/store";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const [run, events, opportunity, suppliers, outreach] = await Promise.all([
      getRun(id),
      getRunEvents(id),
      getOpportunity(id),
      getSuppliers(id),
      getOutreach(id),
    ]);
    return Response.json({ run, events, opportunity: opportunity[0] ?? null, suppliers, outreach });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
