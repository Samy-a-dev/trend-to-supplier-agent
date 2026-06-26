/** Prometheux adapter — HTTP client to the Python FastAPI sidecar (/derive, /health). */
import { env } from "../env";
import { toolLog } from "../log";

/** Rough row count from the backend's opaque results blob, for logging only. */
function countRows(results: unknown): number | undefined {
  const facts = (results as { facts?: unknown[] })?.facts;
  return Array.isArray(facts) ? facts.length : undefined;
}

export type DeriveRequest = {
  /** Full Vadalog program: facts + rules + @output(...). */
  program: string;
  /** The predicate declared with @output(...) whose rows to fetch. */
  output_predicate: string;
  page_size?: number;
};

export type DeriveResponse = {
  project_id: string;
  /** Backend's opaque JSON `data` from fetch_results — shape normalized in M0. */
  results: unknown;
};

export async function derive(req: DeriveRequest, timeoutMs = 60_000): Promise<DeriveResponse> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const t0 = Date.now();
  toolLog("prometheux", "derive → sidecar /derive", {
    sidecar: env.sidecarUrl(),
    output: req.output_predicate,
    programBytes: req.program.length,
    programLines: req.program.split("\n").length,
  });
  try {
    const res = await fetch(`${env.sidecarUrl()}/derive`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ page_size: 1000, ...req }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      throw new Error(`Prometheux sidecar /derive ${res.status}: ${await res.text()}`);
    }
    const out = (await res.json()) as DeriveResponse;
    toolLog("prometheux", "derive ✓", {
      output: req.output_predicate,
      project_id: out.project_id,
      derivedRows: countRows(out.results),
      ms: Date.now() - t0,
    });
    return out;
  } finally {
    clearTimeout(timer);
  }
}

export async function sidecarHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${env.sidecarUrl()}/health`);
    toolLog("prometheux", "health", { sidecar: env.sidecarUrl(), ok: res.ok });
    return res.ok;
  } catch (e) {
    toolLog("prometheux", "health unreachable", { sidecar: env.sidecarUrl(), error: String(e) });
    return false;
  }
}
