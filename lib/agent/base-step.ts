/**
 * Shared base for pipeline steps. Each step is an ADK BaseAgent whose `runAsyncImpl`
 * is an async generator: it yields progress Events (streamed to the UI + persisted)
 * and writes its output to session state via `actions.stateDelta`.
 */
import { BaseAgent, createEvent, createEventActions } from "@google/adk";
import type { Event, InvocationContext } from "@google/adk";

export type StepKind = "step_start" | "progress" | "step_done" | "step_error" | "warning";

export abstract class PipelineStep extends BaseAgent {
  /** If true, a thrown error aborts the whole pipeline; otherwise it's logged and the run continues. */
  protected critical = false;

  constructor(name: string, description = "") {
    super({ name, description });
  }

  /** Build an ADK Event carrying a progress message and (optionally) a state write. */
  protected event(
    ctx: InvocationContext,
    message: string,
    kind: StepKind,
    stateDelta?: Record<string, unknown>,
  ): Event {
    const params: Record<string, unknown> = {
      invocationId: ctx.invocationId,
      author: this.name,
      branch: ctx.branch,
      content: { role: "model", parts: [{ text: message }] },
      actions: createEventActions(stateDelta ? { stateDelta } : {}),
      customMetadata: { kind, step: this.name },
    };
    return createEvent(params as Parameters<typeof createEvent>[0]);
  }

  /** Read a prior step's output from session state. */
  protected read<T>(ctx: InvocationContext, key: string): T | undefined {
    return ctx.session.state[key] as T | undefined;
  }

  // ADK requires runLiveImpl; this pipeline does not use live/bidi mode.
  protected async *runLiveImpl(_ctx: InvocationContext): AsyncGenerator<Event, void, void> {
    throw new Error(`${this.name}: live mode not supported`);
    yield undefined as never; // unreachable; satisfies the generator return type
  }
}

/** Read the {kind, step} we stash on each event's customMetadata. */
export function eventMeta(ev: Event): { kind?: StepKind; step?: string } {
  return ((ev as { customMetadata?: { kind?: StepKind; step?: string } }).customMetadata) ?? {};
}

/** Extract the human-readable text from an event's content. */
export function eventText(ev: Event): string {
  return ev.content?.parts?.map((p) => (p as { text?: string }).text ?? "").join("") ?? "";
}
