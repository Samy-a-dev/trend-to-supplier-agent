/**
 * Typed persistence over ClickHouse. Append-only tables are written as steps run;
 * the mutable tables (agent_runs, product_opportunities, outreach_emails) use
 * ReplacingMergeTree and are written with the FULL row each time (omitted columns
 * would otherwise reset to defaults), then read with FINAL.
 */
import { insertRows, queryJson } from "../adapters/clickhouse";
import type {
  Competitor,
  Opportunity,
  OutreachEmail,
  PainPoint,
  ReviewInsight,
  Scores,
  Supplier,
  VariantConcept,
} from "../types";

const nowIso = () => new Date().toISOString().replace("T", " ").replace("Z", "");

// ── append-only observation tables ───────────────────────────────────────────

export function recordTrendObservations(
  runId: string,
  source: string,
  items: { url?: string; topic?: string; payload: unknown }[],
) {
  return insertRows(
    "trend_observations",
    items.map((it) => ({
      run_id: runId,
      source,
      url: it.url ?? "",
      topic: it.topic ?? "",
      payload: JSON.stringify(it.payload ?? {}),
    })),
    { waitForAsyncInsert: false },
  );
}

export function recordMarketplaceListings(
  runId: string,
  source: string,
  rows: {
    url?: string;
    product?: string;
    asin?: string;
    priceCents?: number;
    rating?: number;
    reviewCount?: number;
    payload: unknown;
  }[],
) {
  return insertRows(
    "marketplace_listings",
    rows.map((r) => ({
      run_id: runId,
      source,
      url: r.url ?? "",
      product: r.product ?? "",
      asin: r.asin ?? "",
      price_cents: Math.round(r.priceCents ?? 0),
      rating: r.rating ?? 0,
      review_count: r.reviewCount ?? 0,
      payload: JSON.stringify(r.payload ?? {}),
    })),
    { waitForAsyncInsert: false },
  );
}

export function recordReviewInsights(runId: string, insights: ReviewInsight[]) {
  return insertRows(
    "review_insights",
    insights.map((i) => ({
      run_id: runId,
      source: "amazon",
      product: i.product,
      theme: i.theme,
      sentiment: i.sentiment,
      frequency: i.frequency,
      payload: "{}",
    })),
    { waitForAsyncInsert: false },
  );
}

export function recordPainPoints(runId: string, pains: PainPoint[]) {
  return insertRows(
    "customer_pain_points",
    pains.map((p) => ({
      run_id: runId,
      product: p.product,
      pain: p.pain,
      severity: p.severity,
      evidence_count: p.evidenceCount,
      payload: "{}",
    })),
    { waitForAsyncInsert: false },
  );
}

export function recordCompetitors(runId: string, competitors: Competitor[]) {
  return insertRows(
    "competitor_products",
    competitors.map((c) => ({
      run_id: runId,
      product: c.product,
      competitor: c.competitor,
      weakness: c.weakness,
      url: c.url ?? "",
      payload: "{}",
    })),
    { waitForAsyncInsert: false },
  );
}

export function recordSuppliers(runId: string, suppliers: Supplier[]) {
  return insertRows(
    "supplier_candidates",
    suppliers.map((s) => ({
      run_id: runId,
      name: s.name,
      url: s.url,
      country: s.country ?? "",
      moq: s.moq ?? "",
      capabilities: s.capabilities ?? "",
      fit_score: s.fitScore ?? 0,
      payload: "{}",
    })),
  );
}

// ── mutable tables (full-row writes) ─────────────────────────────────────────

export function upsertRun(run: {
  runId: string;
  vertical: string;
  region: string;
  status: "running" | "succeeded" | "failed";
  topProduct?: string;
  error?: string;
  startedAt: string; // "YYYY-MM-DD HH:MM:SS.mmm"
}) {
  return insertRows("agent_runs", [
    {
      run_id: run.runId,
      vertical: run.vertical,
      region: run.region,
      status: run.status,
      top_product: run.topProduct ?? "",
      error: run.error ?? "",
      started_at: run.startedAt,
      finished_at: run.status === "running" ? null : nowIso(),
      updated_at: nowIso(),
      payload: "{}",
    },
  ]);
}

export function upsertOpportunity(
  runId: string,
  opp: Opportunity,
  scores?: Scores,
  variant?: VariantConcept,
  status: "open" | "sourced" = "open",
) {
  return insertRows("product_opportunities", [
    {
      id: runId, // one top opportunity per run
      run_id: runId,
      product: opp.product,
      summary: opp.summary,
      trend_strength: scores?.trendStrength ?? 0,
      demand_quality: scores?.demandQuality ?? 0,
      pain_intensity: scores?.painIntensity ?? 0,
      saturation: scores?.saturation ?? 0,
      differentiation: scores?.differentiation ?? 0,
      supplier_fit: scores?.supplierFit ?? 0,
      margin_potential: scores?.marginPotential ?? 0,
      sourcing_risk: scores?.sourcingRisk ?? 0,
      variant_spec: variant?.spec ?? "",
      image_paths: variant?.imagePaths ?? [],
      status,
      payload: JSON.stringify({ opportunity: opp, scores, variant }),
      updated_at: nowIso(),
    },
  ]);
}

export function recordOutreach(runId: string, emails: OutreachEmail[]) {
  return insertRows(
    "outreach_emails",
    emails.map((e) => ({
      id: e.id,
      run_id: runId,
      supplier_name: e.supplierName,
      to_email: e.toEmail,
      subject: e.subject,
      body: e.body,
      status: e.status,
      gmail_draft_id: e.gmailDraftId ?? "",
      updated_at: nowIso(),
    })),
  );
}

export async function setOutreachDrafted(runId: string, id: string, gmailDraftId: string) {
  const rows = await queryJson<OutreachRow>(
    "SELECT * FROM outreach_emails FINAL WHERE run_id = {rid:String} AND id = {id:String} LIMIT 1",
    { rid: runId, id },
  );
  if (rows.length === 0) throw new Error(`outreach email ${id} not found in run ${runId}`);
  const e = rows[0];
  await insertRows("outreach_emails", [
    {
      id: e.id,
      run_id: e.run_id,
      supplier_name: e.supplier_name,
      to_email: e.to_email,
      subject: e.subject,
      body: e.body,
      status: "drafted_in_gmail",
      gmail_draft_id: gmailDraftId,
      updated_at: nowIso(),
    },
  ]);
}

// ── read helpers (UI) ────────────────────────────────────────────────────────

export type RunRow = {
  run_id: string;
  vertical: string;
  region: string;
  status: string;
  top_product: string;
  error: string;
  started_at: string;
  updated_at: string;
};

export type OutreachRow = {
  id: string;
  run_id: string;
  supplier_name: string;
  to_email: string;
  subject: string;
  body: string;
  status: string;
  gmail_draft_id: string;
};

export function listRuns(limit = 50) {
  return queryJson<RunRow>(
    "SELECT run_id, vertical, region, status, top_product, error, toString(started_at) AS started_at, toString(updated_at) AS updated_at FROM agent_runs FINAL ORDER BY started_at DESC LIMIT {lim:UInt32}",
    { lim: limit },
  );
}

export async function getRun(runId: string): Promise<RunRow | null> {
  const rows = await queryJson<RunRow>(
    "SELECT run_id, vertical, region, status, top_product, error, toString(started_at) AS started_at, toString(updated_at) AS updated_at FROM agent_runs FINAL WHERE run_id = {rid:String} LIMIT 1",
    { rid: runId },
  );
  return rows[0] ?? null;
}

export function getRunEvents(runId: string) {
  return queryJson<{ ts: string; step: string; kind: string; message: string; data: string }>(
    "SELECT toString(ts) AS ts, step, kind, message, data FROM run_events WHERE run_id = {rid:String} ORDER BY ts ASC",
    { rid: runId },
  );
}

export function getOpportunity(runId: string) {
  return queryJson<Record<string, unknown>>(
    "SELECT * FROM product_opportunities FINAL WHERE run_id = {rid:String} LIMIT 1",
    { rid: runId },
  );
}

export function getSuppliers(runId: string) {
  return queryJson<Record<string, unknown>>(
    "SELECT name, url, country, moq, capabilities, fit_score FROM supplier_candidates WHERE run_id = {rid:String} ORDER BY fit_score DESC",
    { rid: runId },
  );
}

export function getOutreach(runId: string) {
  return queryJson<OutreachRow>(
    "SELECT id, run_id, supplier_name, to_email, subject, body, status, gmail_draft_id FROM outreach_emails FINAL WHERE run_id = {rid:String}",
    { rid: runId },
  );
}
