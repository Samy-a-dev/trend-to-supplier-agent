/** Starts a pipeline run and streams its events as Server-Sent Events. */
export const runtime = "nodejs";
export const maxDuration = 800;

import { runPipeline } from "@/lib/agent/runner";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    vertical?: string;
    region?: string;
    runId?: string;
  };
  const vertical = (body.vertical ?? "").trim();
  const region = (body.region ?? "US").trim();
  const runId = (body.runId ?? "").trim() || `run_${Date.now()}`;
  if (!vertical) return new Response("vertical is required", { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      try {
        send({ kind: "info", step: "run", message: "starting", runId });
        for await (const ev of runPipeline({ runId, vertical, region })) {
          send(ev);
        }
      } catch (e) {
        send({ kind: "step_error", step: "run", message: String(e), runId });
      } finally {
        controller.enqueue(encoder.encode("event: done\ndata: {}\n\n"));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
