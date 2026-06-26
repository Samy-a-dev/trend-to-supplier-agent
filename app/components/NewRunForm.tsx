"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const EXAMPLES = ["home fitness", "desk setup", "pet accessories", "kitchen gadgets"];

export default function NewRunForm() {
  const [vertical, setVertical] = useState("");
  const [region, setRegion] = useState("US");
  const router = useRouter();

  const start = () => {
    const v = vertical.trim();
    if (!v) return;
    const runId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const qs = new URLSearchParams({ vertical: v, region, autostart: "1" });
    router.push(`/runs/${runId}?${qs.toString()}`);
  };

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-5">
      <label className="block text-sm font-medium text-neutral-300">Market vertical</label>
      <div className="mt-2 flex gap-2">
        <input
          value={vertical}
          onChange={(e) => setVertical(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && start()}
          placeholder="e.g. home fitness"
          className="flex-1 rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-neutral-500"
        />
        <input
          value={region}
          onChange={(e) => setRegion(e.target.value)}
          className="w-20 rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-neutral-500"
          title="Region"
        />
        <button
          onClick={start}
          className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-neutral-200"
        >
          Run agent
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            onClick={() => setVertical(ex)}
            className="rounded-full border border-neutral-700 px-3 py-1 text-xs text-neutral-400 hover:border-neutral-500 hover:text-neutral-200"
          >
            {ex}
          </button>
        ))}
      </div>
    </div>
  );
}
