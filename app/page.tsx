import Link from "next/link";
import { listRuns } from "@/lib/db/store";
import NewRunForm from "./components/NewRunForm";

export const dynamic = "force-dynamic";

const statusColor: Record<string, string> = {
  running: "text-amber-400",
  succeeded: "text-emerald-400",
  failed: "text-red-400",
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
    <main className="mx-auto max-w-4xl px-6 py-12">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Sourcing Agent</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Live trends → validated opportunity → supplier shortlist → RFQ drafts.
        </p>
      </header>

      <NewRunForm />

      {error && (
        <p className="mt-4 rounded-lg border border-red-900/50 bg-red-950/30 px-4 py-3 text-xs text-red-300">
          Could not load runs (check ClickHouse env): {error}
        </p>
      )}

      <section className="mt-10">
        <h2 className="mb-3 text-sm font-medium text-neutral-300">Recent runs</h2>
        {runs.length === 0 ? (
          <p className="text-sm text-neutral-500">No runs yet.</p>
        ) : (
          <ul className="divide-y divide-neutral-800 overflow-hidden rounded-xl border border-neutral-800">
            {runs.map((r) => (
              <li key={r.run_id}>
                <Link
                  href={`/runs/${r.run_id}`}
                  className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-neutral-900/50"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {r.vertical || r.run_id}
                    </div>
                    <div className="truncate text-xs text-neutral-500">
                      {r.top_product || "—"}
                    </div>
                  </div>
                  <span className={`text-xs font-medium ${statusColor[r.status] ?? "text-neutral-400"}`}>
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
