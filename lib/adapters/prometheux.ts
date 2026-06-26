/** Prometheux adapter — HTTP client to the Python FastAPI sidecar (/derive, /health). */
import { env } from "../env";

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
    return (await res.json()) as DeriveResponse;
  } finally {
    clearTimeout(timer);
  }
}

export async function sidecarHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${env.sidecarUrl()}/health`);
    return res.ok;
  } catch {
    return false;
  }
}
