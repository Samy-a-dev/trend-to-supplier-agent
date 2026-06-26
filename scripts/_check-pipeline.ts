/* Validate ADK orchestration: SequentialAgent runs steps in order, streams events,
   and propagates state between steps via stateDelta. No credentials needed. */
import { SequentialAgent, InMemoryRunner } from "@google/adk";
import type { Event, InvocationContext } from "@google/adk";
import { PipelineStep, eventMeta, eventText } from "../lib/agent/base-step";

class DummyA extends PipelineStep {
  constructor() {
    super("dummy_a", "first step");
  }
  protected async *runAsyncImpl(ctx: InvocationContext): AsyncGenerator<Event, void, void> {
    yield this.event(ctx, "A started", "step_start");
    await new Promise((r) => setTimeout(r, 10));
    yield this.event(ctx, "A working…", "progress");
    yield this.event(ctx, "A done", "step_done", { fromA: 42 });
  }
}

class DummyB extends PipelineStep {
  constructor() {
    super("dummy_b", "second step");
  }
  protected async *runAsyncImpl(ctx: InvocationContext): AsyncGenerator<Event, void, void> {
    const a = this.read<number>(ctx, "fromA");
    yield this.event(ctx, `B sees fromA=${a}`, "progress");
    yield this.event(ctx, "B done", "step_done", { fromB: (a ?? 0) + 1 });
  }
}

async function main() {
  const pipeline = new SequentialAgent({
    name: "dummy_pipeline",
    subAgents: [new DummyA(), new DummyB()],
  });
  const runner = new InMemoryRunner({ agent: pipeline });
  await runner.sessionService.createSession({
    appName: "InMemoryRunner",
    userId: "u1",
    sessionId: "s1",
  });

  for await (const ev of runner.runAsync({
    userId: "u1",
    sessionId: "s1",
    newMessage: { role: "user", parts: [{ text: "go" }] },
  })) {
    const { kind, step } = eventMeta(ev);
    const delta = ev.actions?.stateDelta;
    const tail = delta && Object.keys(delta).length ? `  Δ${JSON.stringify(delta)}` : "";
    console.log(`[${step ?? ev.author}] ${kind ?? "-"}: ${eventText(ev)}${tail}`);
  }

  const sess = await runner.sessionService.getSession({
    appName: "InMemoryRunner",
    userId: "u1",
    sessionId: "s1",
  });
  console.log("final state:", JSON.stringify(sess?.state));
  const ok = sess?.state?.fromA === 42 && sess?.state?.fromB === 43;
  console.log(ok ? "✓ ordering + state propagation OK" : "✗ state propagation FAILED");
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
