"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { STEP_META } from "@/lib/agent/steps-meta";
import ConstellationLoader from "../../components/ConstellationLoader";
import type {
  Opportunity,
  OutreachEmail,
  Scores,
  Supplier,
  VariantConcept,
} from "@/lib/types";

type StepState = "pending" | "running" | "done" | "error";
type ToolDetail = { name: string; msg?: string; [k: string]: unknown };
type LogLine = { step: string; kind: string; message: string; detail?: ToolDetail };
type EventMsg = {
  step?: string;
  kind?: string;
  message?: string;
  data?: Record<string, unknown>;
};
type ApproveResponse = {
  ok?: boolean;
  draftId?: string;
  imageCount?: number;
  skippedImages?: string[];
  error?: string;
};

const SCORE_LABELS: [keyof Scores, string][] = [
  ["trendStrength", "Trend strength"],
  ["demandQuality", "Demand quality"],
  ["painIntensity", "Pain intensity"],
  ["saturation", "Saturation"],
  ["differentiation", "Differentiation"],
  ["supplierFit", "Supplier fit"],
  ["marginPotential", "Margin potential"],
  ["sourcingRisk", "Sourcing risk"],
];

export default function RunView({
  runId,
  autostart,
  vertical,
  region,
  fresh,
}: {
  runId: string;
  autostart: boolean;
  vertical: string;
  region: string;
  fresh: boolean;
}) {
  const [status, setStatus] = useState<Record<string, StepState>>({});
  const [log, setLog] = useState<LogLine[]>([]);
  const [opportunity, setOpportunity] = useState<Opportunity | null>(null);
  const [scores, setScores] = useState<Scores | null>(null);
  const [variant, setVariant] = useState<VariantConcept | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [emails, setEmails] = useState<OutreachEmail[]>([]);
  const [approving, setApproving] = useState<Record<string, boolean>>({});
  const [running, setRunning] = useState(false);
  const [tab, setTab] = useState<string | null>(null);
  const started = useRef(false);

  const apply = useCallback((ev: EventMsg) => {
    if (ev.step && STEP_META.some((s) => s.id === ev.step)) {
      setStatus((prev) => {
        const next = { ...prev };
        if (ev.kind === "step_start") next[ev.step!] = "running";
        else if (ev.kind === "step_done") next[ev.step!] = "done";
        else if (ev.kind === "step_error") next[ev.step!] = "error";
        else if (!next[ev.step!]) next[ev.step!] = "running";
        return next;
      });
    }
    if (ev.message) {
      const rawTool = ev.data && typeof ev.data === "object" ? ev.data.tool : undefined;
      const detail =
        rawTool && typeof rawTool === "object" ? (rawTool as ToolDetail) : undefined;
      setLog((prev) => [
        ...prev,
        { step: ev.step ?? "", kind: ev.kind ?? "", message: ev.message!, detail },
      ]);
    }
    const d = ev.data;
    if (d && typeof d === "object") {
      if (d.opportunity) setOpportunity(d.opportunity as Opportunity);
      if (d.scores) setScores(d.scores as Scores);
      if (d.variant) setVariant(d.variant as VariantConcept);
      if (d.suppliers) setSuppliers(d.suppliers as Supplier[]);
      if (d.emails) setEmails(d.emails as OutreachEmail[]);
    }
  }, []);

  const startStream = useCallback(async () => {
    setRunning(true);
    try {
      const res = await fetch("/api/runs/stream", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ runId, vertical, region, fresh }),
      });
      const reader = res.body?.getReader();
      if (!reader) throw new Error("no stream");
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let idx: number;
        while ((idx = buf.indexOf("\n\n")) >= 0) {
          const chunk = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const line = chunk.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          const json = line.slice(6).trim();
          if (!json) continue;
          try {
            apply(JSON.parse(json) as EventMsg);
          } catch {
            /* ignore malformed chunk */
          }
        }
      }
    } catch (e) {
      setLog((prev) => [...prev, { step: "run", kind: "step_error", message: String(e) }]);
    } finally {
      setRunning(false);
    }
  }, [runId, vertical, region, fresh, apply]);

  const loadDetail = useCallback(async () => {
    const res = await fetch(`/api/runs/${runId}`);
    const d = (await res.json()) as {
      events?: { step: string; kind: string; message: string; data: string }[];
      opportunity?: { payload?: string } | null;
      suppliers?: Record<string, unknown>[];
      outreach?: Record<string, unknown>[];
    };
    for (const e of d.events ?? []) {
      let data: Record<string, unknown> = {};
      try {
        data = JSON.parse(e.data || "{}");
      } catch {
        /* ignore */
      }
      apply({ step: e.step, kind: e.kind, message: e.message, data });
    }
    if (d.opportunity?.payload) {
      try {
        const p = JSON.parse(d.opportunity.payload) as {
          opportunity?: Opportunity;
          scores?: Scores;
          variant?: VariantConcept;
        };
        if (p.opportunity) setOpportunity(p.opportunity);
        if (p.scores) setScores(p.scores);
        if (p.variant) setVariant(p.variant);
      } catch {
        /* ignore */
      }
    }
    if (d.suppliers) {
      setSuppliers(
        d.suppliers.map((s) => ({
          name: String(s.name ?? ""),
          url: String(s.url ?? ""),
          country: String(s.country ?? ""),
          moq: String(s.moq ?? ""),
          capabilities: String(s.capabilities ?? ""),
          fitScore: Number(s.fit_score ?? 0),
        })),
      );
    }
    if (d.outreach) {
      setEmails(
        d.outreach.map((o) => ({
          id: String(o.id ?? ""),
          supplierName: String(o.supplier_name ?? ""),
          toEmail: String(o.to_email ?? ""),
          subject: String(o.subject ?? ""),
          body: String(o.body ?? ""),
          status: (String(o.status ?? "draft") as OutreachEmail["status"]),
          gmailDraftId: String(o.gmail_draft_id ?? ""),
        })),
      );
    }
  }, [runId, apply]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (autostart) void startStream();
    else void loadDetail();
  }, [autostart, startStream, loadDetail]);

  const approve = async (id: string) => {
    setApproving((prev) => ({ ...prev, [id]: true }));
    try {
      const res = await fetch("/api/outreach/approve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ runId, id, imagePaths: variant?.imagePaths ?? [] }),
      });
      const data = (await res.json().catch(() => ({}))) as ApproveResponse;
      if (!res.ok || !data.ok) throw new Error(data.error || `Gmail approval failed (${res.status})`);

      const imageCount = data.imageCount ?? 0;
      const skippedImages = data.skippedImages ?? [];
      setEmails((prev) =>
        prev.map((e) =>
          e.id === id ? { ...e, status: "drafted_in_gmail", gmailDraftId: data.draftId ?? e.gmailDraftId } : e,
        ),
      );
      setLog((prev) => [
        ...prev,
        {
          step: "gmail",
          kind: "step_done",
          message: `Gmail draft created with ${imageCount} image(s)`,
        },
      ]);
      if (skippedImages.length) {
        setLog((prev) => [
          ...prev,
          {
            step: "gmail",
            kind: "warning",
            message: `Skipped ${skippedImages.length} image(s): ${skippedImages.join("; ")}`,
          },
        ]);
      }
    } catch (e) {
      setLog((prev) => [
        ...prev,
        { step: "gmail", kind: "step_error", message: e instanceof Error ? e.message : String(e) },
      ]);
    } finally {
      setApproving((prev) => ({ ...prev, [id]: false }));
    }
  };

  // Result sections become tabs as their data arrives — so the run reads as a
  // set of pages to navigate, not one long scroll. Activity is always present.
  const sections = (
    [
      opportunity ? { id: "opportunity", label: "Opportunity" } : null,
      variant ? { id: "variant", label: "Variant" } : null,
      suppliers.length > 0
        ? { id: "suppliers", label: "Suppliers", count: suppliers.length }
        : null,
      emails.length > 0 ? { id: "rfq", label: "RFQ drafts", count: emails.length } : null,
      { id: "activity", label: "Activity" },
    ] as ({ id: string; label: string; count?: number } | null)[]
  ).filter(Boolean) as { id: string; label: string; count?: number }[];
  const ids = sections.map((s) => s.id);
  // Default: watch Activity on a live run; open Opportunity when viewing a result.
  const auto = !autostart && opportunity ? "opportunity" : "activity";
  const active = tab && ids.includes(tab) ? tab : auto;

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <Link
            href="/"
            className="font-mono-ui text-[11px] uppercase tracking-[0.2em] text-slate transition hover:text-electric"
          >
            ← all runs
          </Link>
          <h1 className="mt-2 font-display text-3xl italic leading-tight text-ink">
            {opportunity?.title || vertical || runId}
          </h1>
        </div>
        {running && (
          <span className="flex shrink-0 items-center gap-2 rounded-full border border-electric/25 bg-electric/5 px-3 py-1">
            <span className="size-1.5 animate-pulse rounded-full bg-electric" />
            <span className="shimmer-text font-mono-ui text-[11px] uppercase tracking-wider">
              running
            </span>
          </span>
        )}
      </div>

      {/* Step rail — the 9 stages, numbered, as live status */}
      <ol className="mb-10 grid grid-cols-3 gap-2 sm:grid-cols-9">
        {STEP_META.map((s, i) => {
          const st = status[s.id] ?? "pending";
          const cls =
            st === "done"
              ? "border-electric/30 bg-electric/[0.06] text-ink"
              : st === "running"
                ? "border-electric bg-electric/10 text-ink animate-pulse"
                : st === "error"
                  ? "border-red-300 bg-red-50 text-red-700"
                  : "border-line bg-card text-slate/55";
          const dot =
            st === "done"
              ? "bg-electric"
              : st === "running"
                ? "bg-electric"
                : st === "error"
                  ? "bg-red-500"
                  : "bg-blue/25";
          return (
            <li
              key={s.id}
              className={`flex flex-col items-center gap-1.5 rounded-xl border px-2 py-2.5 text-center ${cls}`}
              title={s.label}
            >
              <span className="flex w-full items-center justify-between">
                <span className="font-mono-ui text-[9px] tabular-nums opacity-50">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className={`size-[7px] rounded-full ${dot}`} />
              </span>
              <span className="text-[11px] font-medium leading-tight">{s.label}</span>
            </li>
          );
        })}
      </ol>

      {/* Section nav — pick a section instead of scrolling the whole run */}
      <div className="sticky top-0 z-20 -mx-6 mb-8 border-b border-line bg-paper/80 px-6 backdrop-blur">
        <nav className="scroll-quiet flex gap-1 overflow-x-auto" aria-label="Run sections">
          {sections.map((s) => {
            const on = active === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setTab(s.id)}
                aria-current={on ? "page" : undefined}
                className={`relative shrink-0 px-3 py-3 font-mono-ui text-[11px] uppercase tracking-wider transition ${
                  on ? "text-ink" : "text-slate hover:text-ink"
                }`}
              >
                <span className="flex items-center gap-1.5">
                  {s.id === "activity" && running && (
                    <span className="size-1.5 animate-pulse rounded-full bg-electric" />
                  )}
                  {s.label}
                  {s.count != null && <span className="text-slate/55">{s.count}</span>}
                </span>
                {on && (
                  <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-electric" />
                )}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="mx-auto max-w-3xl space-y-6">
        {active === "opportunity" && opportunity && (
          <>
            <Panel title="Opportunity">
              <p className="text-sm leading-relaxed text-ink">{opportunity.summary}</p>
              <p className="mt-2 text-xs leading-relaxed text-slate">{opportunity.rationale}</p>
              {opportunity.painPoints?.length > 0 && (
                <div className="mt-4">
                  <div className="eyebrow mb-2">Customer pain points</div>
                  <ul className="space-y-1.5">
                    {opportunity.painPoints.map((p, i) => (
                      <li key={i} className="flex items-baseline gap-2 text-xs text-ink">
                        <span className="text-electric">→</span>
                        <span>
                          {p.pain}{" "}
                          <span className="font-mono-ui text-slate/70">
                            ({Math.round(p.severity * 100)}%)
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Panel>

            {scores && (
              <Panel
                title="Scores"
                badge={scores.stockCandidate ? "Stock candidate" : undefined}
              >
                <div className="space-y-2.5">
                  {SCORE_LABELS.map(([key, label]) => {
                    const pct = Math.round((scores[key] as number) * 100);
                    return (
                      <div key={key} className="flex items-center gap-3">
                        <div className="w-32 shrink-0 text-xs text-slate">{label}</div>
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
                          <div
                            className="h-full rounded-full bg-electric"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <div className="w-8 text-right font-mono-ui text-xs tabular-nums text-ink">
                          {pct}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Panel>
            )}
          </>
        )}

        {active === "variant" && variant && (
          <Panel title={`Variant — ${variant.name}`}>
            <p className="text-sm leading-relaxed text-ink">{variant.spec}</p>
            {variant.imagePaths?.length > 0 && (
              <div className="mt-3 grid grid-cols-3 gap-2">
                {variant.imagePaths.map((src) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={src}
                    src={src}
                    alt="concept"
                    className="aspect-square rounded-xl border border-line object-cover"
                  />
                ))}
              </div>
            )}
          </Panel>
        )}

        {active === "suppliers" && suppliers.length > 0 && (
          <Panel title={`Suppliers (${suppliers.length})`}>
            <ul className="divide-y divide-[var(--color-line)]">
              {suppliers.map((s, i) => (
                <li key={i} className="py-2 text-sm first:pt-0 last:pb-0">
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-ink transition hover:text-electric hover:underline"
                  >
                    {s.name}
                  </a>
                  <span className="ml-2 font-mono-ui text-xs text-slate">
                    {s.country} {s.moq ? `· MOQ ${s.moq}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        )}

        {active === "rfq" && emails.length > 0 && (
          <Panel title={`RFQ drafts (${emails.length})`}>
            <ul className="space-y-3">
              {emails.map((e) => (
                <li key={e.id} className="rounded-xl border border-line bg-paper/50 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-medium text-ink">{e.supplierName}</div>
                    {e.status === "drafted_in_gmail" ? (
                      <span className="font-mono-ui text-xs text-emerald-600">
                        ✓ in Gmail drafts
                      </span>
                    ) : (
                      <button
                        onClick={() => approve(e.id)}
                        disabled={approving[e.id]}
                        className="rounded-lg bg-electric px-3 py-1 text-xs font-semibold text-white transition hover:bg-blue disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {approving[e.id] ? "Creating…" : "Approve → Gmail draft"}
                      </button>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-slate">{e.subject}</div>
                  <pre className="mt-2 whitespace-pre-wrap font-mono-ui text-xs leading-relaxed text-slate">
                    {e.body}
                  </pre>
                </li>
              ))}
            </ul>
          </Panel>
        )}

        {active === "activity" && (
          <Panel title="Activity">
            <div className="scroll-quiet max-h-[68vh] space-y-1 overflow-y-auto font-mono-ui text-[11px]">
              {log.length === 0 && (
                <div className="flex flex-col items-center gap-3 py-10">
                  <ConstellationLoader size={72} label="scanning for signal" />
                </div>
              )}
              {log.map((l, i) => (
                <div key={i}>
                  <div
                    className={
                      l.kind === "step_error"
                        ? "text-red-600"
                        : l.kind === "warning"
                          ? "text-amber-600"
                          : l.kind === "step_done"
                            ? "text-emerald-600"
                            : "text-slate"
                    }
                  >
                    <span className="text-slate/50">{l.step}</span> {l.message}
                  </div>
                  {l.detail && <ToolDetailView detail={l.detail} />}
                </div>
              ))}
            </div>
          </Panel>
        )}
      </div>
    </main>
  );
}

function Panel({
  title,
  badge,
  children,
}: {
  title: string;
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="eyebrow">{title}</h3>
        {badge && (
          <span className="rounded-full bg-electric/10 px-2 py-0.5 font-mono-ui text-[10px] font-semibold uppercase tracking-wider text-electric">
            {badge}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

// Per-sponsor badge colors so tool usage is visually distinct in the activity stream.
const TOOL_BADGE: Record<string, string> = {
  tavily: "border-sky-300 bg-sky-50 text-sky-700",
  clickhouse: "border-amber-300 bg-amber-50 text-amber-700",
  prometheux: "border-cyan-300 bg-cyan-50 text-cyan-700",
  apify: "border-emerald-300 bg-emerald-50 text-emerald-700",
  gemini: "border-teal-300 bg-teal-50 text-teal-700",
  gmail: "border-rose-300 bg-rose-50 text-rose-700",
};

/** Fields rendered as their own block rather than inline `key=value` chips. */
const BLOCK_FIELDS = new Set(["program", "answer", "queries"]);

/**
 * Renders the structured detail of a sponsor tool call beneath its activity line:
 * a colored badge (Tavily / ClickHouse / Prometheux / …), the scalar params as chips,
 * and any large fields (the Vadalog program, Tavily answer, query list) as blocks.
 */
function ToolDetailView({ detail }: { detail: ToolDetail }) {
  const { name, msg, ...rest } = detail;
  const badge = TOOL_BADGE[name] ?? "border-line bg-paper text-slate";

  const chips = Object.entries(rest).filter(
    ([k, v]) => !BLOCK_FIELDS.has(k) && v !== undefined && v !== null && !Array.isArray(v),
  );
  const lists = Object.entries(rest).filter(([k, v]) => k !== "program" && Array.isArray(v));
  const program = typeof rest.program === "string" ? rest.program : undefined;
  const answer = typeof rest.answer === "string" ? rest.answer : undefined;

  return (
    <div className="mb-1 ml-3 mt-0.5 border-l border-line pl-2">
      <div className="flex flex-wrap items-center gap-1">
        <span className={`rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${badge}`}>
          {name}
        </span>
        {msg && <span className="text-[10px] text-slate">{msg}</span>}
        {chips.map(([k, v]) => (
          <span key={k} className="rounded border border-line bg-paper px-1.5 py-0.5 text-[10px] text-slate">
            {k}=<span className="text-ink">{String(v)}</span>
          </span>
        ))}
      </div>
      {lists.map(([k, v]) => (
        <ul key={k} className="mt-1 space-y-0.5">
          {(v as unknown[]).map((item, i) => (
            <li key={i} className="text-[10px] text-slate">
              <span className="text-slate/50">{k}:</span> {String(item)}
            </li>
          ))}
        </ul>
      ))}
      {answer && (
        <p className="mt-1 border-l-2 border-sky-300 pl-2 text-[10px] italic text-slate">
          {answer}
        </p>
      )}
      {program && (
        <pre className="mt-1 max-h-48 overflow-auto rounded-lg bg-ink p-2 text-[10px] leading-snug text-[#aebbff]">
          {program}
        </pre>
      )}
    </div>
  );
}
