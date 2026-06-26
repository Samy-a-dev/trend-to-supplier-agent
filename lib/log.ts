/**
 * Structured, sponsor-tagged logging for the sourcing pipeline.
 *
 * Two surfaces, one source of truth:
 *  - `toolLog()`  — writes a timestamped, prefixed line to stdout (visible in the
 *                   `pnpm dev` / `pnpm sidecar` terminals) that makes every sponsor
 *                   tool call explicit: the exact query/program sent and what came back.
 *  - `toolEvent()`— does the same console log AND returns a structured `detail` object
 *                   that pipeline steps attach to their ADK events, so the same data
 *                   streams live into the dashboard Activity panel and is persisted to
 *                   the ClickHouse `run_events` table.
 *
 * The goal is transparency: anyone watching a run can see Tavily, ClickHouse, and
 * Prometheux actually being used — the real searches, the real SQL, the real Vadalog.
 */

/** The sponsor / external tool a log line is about. */
export type Tool =
  | "tavily"
  | "clickhouse"
  | "prometheux"
  | "apify"
  | "gemini"
  | "gmail";

/** HH:MM:SS.mmm in UTC — compact and sortable for terminal output. */
const stamp = () => new Date().toISOString().slice(11, 23);

/** Render one field value compactly: truncate long strings, summarize arrays/objects. */
function fmtVal(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "string") {
    const s = v.replace(/\s+/g, " ").trim();
    return s.length > 100 ? JSON.stringify(s.slice(0, 100) + "…") : JSON.stringify(s);
  }
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return `[${v.length}]`;
  const j = JSON.stringify(v);
  return j.length > 120 ? j.slice(0, 120) + "…" : j;
}

/** Write a single structured `HH:MM:SS.mmm [TOOL] message k=v k=v` line to stdout. */
export function toolLog(tool: Tool, message: string, fields?: Record<string, unknown>): void {
  const tail = fields
    ? " " +
      Object.entries(fields)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${k}=${fmtVal(v)}`)
        .join(" ")
    : "";
  // eslint-disable-next-line no-console
  console.log(`${stamp()} [${tool.toUpperCase()}] ${message}${tail}`);
}

/**
 * Log to the terminal AND build the structured detail object a pipeline step attaches
 * to its event (`event(ctx, msg, kind, stateDelta, detail)`). The detail rides through
 * the runner into the SSE stream + `run_events.data`, where the UI renders it under the
 * matching Activity line. `name`/`msg` drive the rendering; everything else is metadata.
 */
export function toolEvent(
  tool: Tool,
  message: string,
  fields?: Record<string, unknown>,
): Record<string, unknown> {
  toolLog(tool, message, fields);
  return { name: tool, msg: message, ...(fields ?? {}) };
}
