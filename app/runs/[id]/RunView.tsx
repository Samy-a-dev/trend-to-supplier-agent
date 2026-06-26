"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { STEP_META } from "@/lib/agent/steps-meta";
import type {
  Opportunity,
  OutreachEmail,
  Scores,
  Supplier,
  VariantConcept,
} from "@/lib/types";

type StepState = "pending" | "running" | "done" | "error";
type LogLine = { step: string; kind: string; message: string };
type EventMsg = {
  step?: string;
  kind?: string;
  message?: string;
  data?: Record<string, unknown>;
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
}: {
  runId: string;
  autostart: boolean;
  vertical: string;
  region: string;
}) {
  const [status, setStatus] = useState<Record<string, StepState>>({});
  const [log, setLog] = useState<LogLine[]>([]);
  const [opportunity, setOpportunity] = useState<Opportunity | null>(null);
  const [scores, setScores] = useState<Scores | null>(null);
  const [variant, setVariant] = useState<VariantConcept | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [emails, setEmails] = useState<OutreachEmail[]>([]);
  const [running, setRunning] = useState(false);
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
      setLog((prev) => [...prev, { step: ev.step ?? "", kind: ev.kind ?? "", message: ev.message! }]);
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
        body: JSON.stringify({ runId, vertical, region }),
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
  }, [runId, vertical, region, apply]);

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
    setEmails((prev) => prev.map((e) => (e.id === id ? { ...e, status: "drafted_in_gmail" } : e)));
    await fetch("/api/outreach/approve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ runId, id }),
    });
  };

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link href="/" className="text-xs text-neutral-500 hover:text-neutral-300">
            ← all runs
          </Link>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">
            {opportunity?.title || vertical || runId}
          </h1>
        </div>
        {running && <span className="text-xs font-medium text-amber-400">running…</span>}
      </div>

      {/* Step rail */}
      <ol className="mb-8 grid grid-cols-3 gap-2 sm:grid-cols-9">
        {STEP_META.map((s) => {
          const st = status[s.id] ?? "pending";
          const color =
            st === "done"
              ? "border-emerald-600/60 bg-emerald-950/30 text-emerald-300"
              : st === "running"
                ? "border-amber-500/60 bg-amber-950/30 text-amber-300 animate-pulse"
                : st === "error"
                  ? "border-red-600/60 bg-red-950/30 text-red-300"
                  : "border-neutral-800 bg-neutral-900/30 text-neutral-500";
          return (
            <li
              key={s.id}
              className={`rounded-lg border px-2 py-2 text-center text-[11px] font-medium ${color}`}
              title={s.label}
            >
              {s.label}
            </li>
          );
        })}
      </ol>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* Left: panels */}
        <div className="space-y-6">
          {opportunity && (
            <Panel title="Opportunity">
              <p className="text-sm text-neutral-300">{opportunity.summary}</p>
              <p className="mt-2 text-xs text-neutral-500">{opportunity.rationale}</p>
              {opportunity.painPoints?.length > 0 && (
                <div className="mt-3">
                  <div className="mb-1 text-xs font-medium text-neutral-400">Customer pain points</div>
                  <ul className="space-y-1">
                    {opportunity.painPoints.map((p, i) => (
                      <li key={i} className="text-xs text-neutral-300">
                        • {p.pain}{" "}
                        <span className="text-neutral-600">({Math.round(p.severity * 100)}%)</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Panel>
          )}

          {scores && (
            <Panel title={`Scores${scores.stockCandidate ? " · STOCK CANDIDATE" : ""}`}>
              <div className="space-y-2">
                {SCORE_LABELS.map(([key, label]) => (
                  <div key={key} className="flex items-center gap-3">
                    <div className="w-32 shrink-0 text-xs text-neutral-400">{label}</div>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-800">
                      <div
                        className="h-full rounded-full bg-neutral-300"
                        style={{ width: `${Math.round((scores[key] as number) * 100)}%` }}
                      />
                    </div>
                    <div className="w-8 text-right text-xs text-neutral-500">
                      {Math.round((scores[key] as number) * 100)}
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          )}

          {variant && (
            <Panel title={`Variant — ${variant.name}`}>
              <p className="text-sm text-neutral-300">{variant.spec}</p>
              {variant.imagePaths?.length > 0 && (
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {variant.imagePaths.map((src) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={src} src={src} alt="concept" className="aspect-square rounded-lg object-cover" />
                  ))}
                </div>
              )}
            </Panel>
          )}

          {suppliers.length > 0 && (
            <Panel title={`Suppliers (${suppliers.length})`}>
              <ul className="space-y-2">
                {suppliers.map((s, i) => (
                  <li key={i} className="text-sm">
                    <a href={s.url} target="_blank" rel="noreferrer" className="text-neutral-200 hover:underline">
                      {s.name}
                    </a>
                    <span className="ml-2 text-xs text-neutral-500">
                      {s.country} {s.moq ? `· MOQ ${s.moq}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          {emails.length > 0 && (
            <Panel title={`RFQ drafts (${emails.length})`}>
              <ul className="space-y-3">
                {emails.map((e) => (
                  <li key={e.id} className="rounded-lg border border-neutral-800 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-medium">{e.supplierName}</div>
                      {e.status === "drafted_in_gmail" ? (
                        <span className="text-xs text-emerald-400">✓ in Gmail drafts</span>
                      ) : (
                        <button
                          onClick={() => approve(e.id)}
                          className="rounded-md bg-white px-3 py-1 text-xs font-semibold text-black hover:bg-neutral-200"
                        >
                          Approve → Gmail draft
                        </button>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-neutral-500">{e.subject}</div>
                    <pre className="mt-2 whitespace-pre-wrap text-xs text-neutral-400">{e.body}</pre>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>

        {/* Right: live log */}
        <div className="lg:sticky lg:top-6 lg:self-start">
          <Panel title="Activity">
            <div className="max-h-[70vh] space-y-1 overflow-y-auto font-mono text-[11px]">
              {log.length === 0 && <p className="text-neutral-600">Waiting…</p>}
              {log.map((l, i) => (
                <div
                  key={i}
                  className={
                    l.kind === "step_error"
                      ? "text-red-400"
                      : l.kind === "warning"
                        ? "text-amber-400"
                        : l.kind === "step_done"
                          ? "text-emerald-400"
                          : "text-neutral-400"
                  }
                >
                  <span className="text-neutral-600">{l.step}</span> {l.message}
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </main>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-neutral-800 bg-neutral-900/30 p-4">
      <h3 className="mb-3 text-sm font-medium text-neutral-300">{title}</h3>
      {children}
    </section>
  );
}
