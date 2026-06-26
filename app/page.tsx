import Link from "next/link";
import { listRuns } from "@/lib/db/store";
import { STEP_META } from "@/lib/agent/steps-meta";
import NewRunForm from "./components/NewRunForm";
import SignalField from "./components/SignalField";

export const dynamic = "force-dynamic";

const statusColor: Record<string, string> = {
  running: "text-electric",
  succeeded: "text-emerald-600",
  failed: "text-red-600",
};

export default async function Home() {
  let runs: Awaited<ReturnType<typeof listRuns>> = [];
  let error = "";
  try {
    runs = await listRuns(25);
  } catch (e) {
    error = String(e);
  }

  return (
    <main className="relative mx-auto min-h-screen max-w-5xl px-6 pb-24">
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="hero-wash relative overflow-hidden pt-10">
        <div className="pointer-events-none absolute inset-0 -z-0">
          <SignalField />
        </div>

        <div className="relative z-10">
          {/* Wordmark / eyebrow */}
          <div className="reveal reveal-1 flex items-center justify-between">
            <div className="flex items-baseline gap-1">
              <span className="font-display text-sm italic text-blue">Sourcing</span>
              <span className="font-mono-ui text-[11px] uppercase tracking-[0.28em] text-ink">
                Agent
              </span>
              <span className="text-electric">*</span>
            </div>
            <span className="flex items-center gap-2 font-mono-ui text-[10px] uppercase tracking-[0.2em] text-slate">
              <span className="size-1.5 animate-pulse rounded-full bg-electric" />
              live signal
            </span>
          </div>

          {/* Thesis headline */}
          <h1 className="reveal reveal-2 mt-16 max-w-3xl font-display text-5xl font-light leading-[1.04] tracking-tight text-ink sm:text-7xl">
            Find the product
            <br />
            <span className="relative inline-block italic text-blue">
              before the market does.
              <svg
                className="draw-underline absolute -bottom-2 left-0 w-full"
                height="14"
                viewBox="0 0 600 14"
                fill="none"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <path
                  d="M2 9 C 140 3, 300 3, 598 7"
                  stroke="#2347ff"
                  strokeWidth="3"
                  strokeLinecap="round"
                  style={{ ["--len" as string]: 640 }}
                />
              </svg>
            </span>
          </h1>

          <p className="reveal reveal-3 mt-8 max-w-xl text-base leading-relaxed text-slate">
            Name a vertical. The agent reads live demand, argues with the evidence,
            designs a better version, finds the suppliers, and writes the outreach —
            and you watch every move.
          </p>

          {/* Primary action */}
          <div className="reveal reveal-4 mt-10 max-w-2xl">
            <NewRunForm />
          </div>
        </div>
      </section>

      {error && (
        <p className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 font-mono-ui text-xs text-red-700">
          Could not load runs (check ClickHouse env): {error}
        </p>
      )}

      {/* ── Pipeline trail (the 9 real stages, in order) ────────── */}
      <section className="reveal reveal-5 mt-16">
        <div className="mb-4 flex items-baseline justify-between">
          <span className="eyebrow">The run, end to end</span>
          <span className="font-mono-ui text-[10px] text-slate/70">9 stages</span>
        </div>
        <div className="relative">
          <div className="absolute left-0 right-0 top-[14px] h-px bg-line" />
          <div className="trail-shimmer absolute left-0 right-0 top-[13px] h-[3px] opacity-70" />
          <ol className="relative grid grid-cols-3 gap-y-6 sm:grid-cols-9 sm:gap-y-0">
            {STEP_META.map((s, i) => (
              <li key={s.id} className="flex flex-col items-center gap-2 text-center">
                <span
                  className={`size-[9px] rounded-full ring-4 ring-paper ${
                    i === 0 ? "bg-electric" : "bg-blue/40"
                  }`}
                />
                <span className="font-mono-ui text-[10px] tabular-nums text-slate/60">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="px-1 text-[11px] font-medium leading-tight text-ink">
                  {s.label}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── Recent runs ─────────────────────────────────────────── */}
      <section className="mt-16">
        <div className="mb-4 flex items-baseline justify-between">
          <span className="eyebrow">Recent runs</span>
          {runs.length > 0 && (
            <span className="font-mono-ui text-[10px] text-slate/70">{runs.length}</span>
          )}
        </div>
        {runs.length === 0 ? (
          <div className="card flex items-center justify-between gap-4 p-6">
            <p className="text-sm text-slate">
              No runs yet — name a market above to send the agent hunting.
            </p>
          </div>
        ) : (
          <ul className="card divide-y divide-[var(--color-line)] overflow-hidden p-0">
            {runs.map((r) => (
              <li key={r.run_id}>
                <Link
                  href={`/runs/${r.run_id}`}
                  className="group flex items-center justify-between gap-4 px-5 py-4 transition hover:bg-paper/60"
                >
                  <div className="min-w-0">
                    <div className="truncate font-display text-base italic text-ink">
                      {r.vertical || r.run_id}
                    </div>
                    <div className="truncate text-xs text-slate">{r.top_product || "—"}</div>
                  </div>
                  <span
                    className={`shrink-0 font-mono-ui text-[11px] uppercase tracking-wider ${
                      statusColor[r.status] ?? "text-slate"
                    }`}
                  >
                    {r.status}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
