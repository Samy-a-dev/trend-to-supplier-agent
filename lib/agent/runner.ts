/**
 * Production run driver: creates an ADK session, runs the pipeline, normalizes each
 * ADK event into a RunEvent (streamed to the SSE route + persisted), and manages the
 * agent_runs lifecycle. The huge rawSignals blob is omitted from the stream/log.
 */
import { Runner, InMemorySessionService } from "@google/adk";
import { buildPipeline } from "./pipeline";
import { eventMeta, eventText, type StepKind } from "./base-step";
import { insertRows } from "../adapters/clickhouse";
import { upsertRun } from "../db/store";
import { STATE, type Opportunity } from "../types";

const APP = "sourcing_agent";
const OPERATOR = "operator";

export type RunEvent = {
  runId: string;
  ts: number;
  step: string;
  kind: StepKind | "info";
  message: string;
  data?: unknown;
};

const nowIso = () => new Date().toISOString().replace("T", " ").replace("Z", "");

async function safe(p: Promise<unknown>): Promise<void> {
  try {
    await p;
  } catch (e) {
    console.warn("[runner] persist failed:", String(e));
  }
}

/** Drop the large rawSignals payload and cap size for streaming/persistence. */
function compactDelta(delta?: Record<string, unknown>): unknown {
  if (!delta || Object.keys(delta).length === 0) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(delta)) {
    out[k] = k === STATE.rawSignals ? "[omitted]" : v;
  }
  return out;
}

function persistEvent(re: RunEvent): Promise<void> {
  const data = JSON.stringify(re.data ?? {}).slice(0, 100_000);
  return insertRows("run_events", [
    { run_id: re.runId, step: re.step, kind: re.kind, message: re.message, data },
  ]);
}

export async function* runPipeline(input: {
  runId: string;
  vertical: string;
  region: string;
}): AsyncGenerator<RunEvent> {
  const { runId, vertical, region } = input;
  const startedAt = nowIso();
  const sessionService = new InMemorySessionService();
  const runner = new Runner({ appName: APP, agent: buildPipeline(), sessionService });

  await sessionService.createSession({
    appName: APP,
    userId: OPERATOR,
    sessionId: runId,
    state: { [STATE.vertical]: vertical, [STATE.region]: region, [STATE.runId]: runId },
  });

  await safe(upsertRun({ runId, vertical, region, status: "running", startedAt }));
  const startEvent: RunEvent = {
    runId,
    ts: Date.now(),
    step: "run",
    kind: "info",
    message: `Run started for "${vertical}"`,
  };
  await safe(persistEvent(startEvent));
  yield startEvent;

  let failed: string | null = null;
  try {
    for await (const ev of runner.runAsync({
      userId: OPERATOR,
      sessionId: runId,
      newMessage: { role: "user", parts: [{ text: vertical }] },
    })) {
      if (ev.author === "user") continue;
      const { kind } = eventMeta(ev);
      const message = eventText(ev);
      const data = compactDelta(ev.actions?.stateDelta);
      if (!message && data === undefined) continue;
      if (kind === "step_error") failed = message;
      const re: RunEvent = {
        runId,
        ts: Date.now(),
        step: ev.author ?? "",
        kind: kind ?? "progress",
        message,
        data,
      };
      await safe(persistEvent(re));
      yield re;
    }
  } catch (e) {
    failed = e instanceof Error ? e.message : String(e);
    const errEvent: RunEvent = {
      runId,
      ts: Date.now(),
      step: "run",
      kind: "step_error",
      message: `Run aborted: ${failed}`,
    };
    await safe(persistEvent(errEvent));
    yield errEvent;
  }

  const sess = await sessionService.getSession({ appName: APP, userId: OPERATOR, sessionId: runId });
  const opp = sess?.state?.[STATE.opportunity] as Opportunity | undefined;
  await safe(
    upsertRun({
      runId,
      vertical,
      region,
      status: failed ? "failed" : "succeeded",
      topProduct: opp?.title ?? "",
      error: failed ?? "",
      startedAt,
    }),
  );

  const doneEvent: RunEvent = {
    runId,
    ts: Date.now(),
    step: "run",
    kind: failed ? "step_error" : "info",
    message: failed ? "Run failed" : "Run complete",
  };
  await safe(persistEvent(doneEvent));
  yield doneEvent;
}
