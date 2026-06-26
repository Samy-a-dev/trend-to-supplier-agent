"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ConstellationLoader from "./ConstellationLoader";

const EXAMPLES = ["home fitness", "desk setup", "pet accessories", "kitchen gadgets"];

export default function NewRunForm() {
  const [vertical, setVertical] = useState("");
  const [region, setRegion] = useState("US");
  const [fresh, setFresh] = useState(false);
  const [launching, setLaunching] = useState(false);
  const router = useRouter();

  const start = () => {
    const v = vertical.trim();
    if (!v || launching) return;
    const runId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const qs = new URLSearchParams({ vertical: v, region, autostart: "1" });
    if (fresh) qs.set("fresh", "1");
    const href = `/runs/${runId}?${qs.toString()}`;

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      router.push(href);
      return;
    }
    // Brief "locking on" transition that echoes the hero before we route.
    setLaunching(true);
    setTimeout(() => router.push(href), 820);
  };

  return (
    <div className="card relative overflow-hidden p-5 sm:p-6">
      <div className="mb-3 flex items-center gap-2">
        <span className="size-1.5 rounded-full bg-electric shadow-[0_0_0_3px_rgba(35,71,255,0.12)]" />
        <span className="eyebrow">Start a run</span>
      </div>

      <label htmlFor="vertical" className="block font-display text-xl text-ink">
        Name a market and watch the agent <em className="italic text-blue">hunt</em>.
      </label>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input
          id="vertical"
          value={vertical}
          onChange={(e) => setVertical(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && start()}
          placeholder="e.g. home fitness"
          className="min-w-0 flex-1 rounded-xl border border-line bg-paper/60 px-4 py-3 text-sm text-ink outline-none transition placeholder:text-slate/55 focus:border-electric/50 focus:bg-card focus:ring-2 focus:ring-electric/15"
        />
        <input
          value={region}
          onChange={(e) => setRegion(e.target.value)}
          aria-label="Region"
          title="Region"
          className="w-full rounded-xl border border-line bg-paper/60 px-4 py-3 text-sm text-ink outline-none transition focus:border-electric/50 focus:bg-card focus:ring-2 focus:ring-electric/15 sm:w-20"
        />
        <button
          onClick={start}
          disabled={!vertical.trim() || launching}
          className="group inline-flex items-center justify-center gap-2 rounded-xl bg-electric px-5 py-3 text-sm font-semibold text-white shadow-[0_8px_24px_-8px_rgba(35,71,255,0.7)] transition hover:bg-blue disabled:cursor-not-allowed disabled:opacity-45"
        >
          Run agent
          <span aria-hidden className="transition-transform group-hover:translate-x-0.5">
            →
          </span>
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono-ui text-[10px] uppercase tracking-wider text-slate/70">
            try
          </span>
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => setVertical(ex)}
              className="rounded-full border border-line px-3 py-1 font-mono-ui text-xs text-slate transition hover:border-electric/45 hover:text-electric"
            >
              {ex}
            </button>
          ))}
        </div>
        <label className="ml-auto flex cursor-pointer select-none items-center gap-2 font-mono-ui text-xs text-slate">
          <input
            type="checkbox"
            checked={fresh}
            onChange={(e) => setFresh(e.target.checked)}
            className="size-3.5 rounded border-line accent-electric"
          />
          Fresh scrape
        </label>
      </div>

      {/* Launch transition — the field locking onto the market before we route. */}
      {launching && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-1 bg-card/85 backdrop-blur-sm">
          <ConstellationLoader size={84} />
          <p className="font-mono-ui text-xs tracking-wider text-slate">
            locking onto <span className="text-electric">{vertical.trim()}</span>…
          </p>
        </div>
      )}
    </div>
  );
}
