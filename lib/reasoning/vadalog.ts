/**
 * Builds the Vadalog program (facts + rules + @output) sent to the Prometheux
 * sidecar. Facts are embedded directly in the program text — no DB binding.
 */
import type { Competitor, PainPoint, Supplier } from "../types";

/** Quote a Vadalog string literal (Vadalog uses double quotes). */
function lit(s: string): string {
  return `"${String(s).replace(/"/g, "'").slice(0, 60)}"`;
}

function slug(s: string): string {
  return (s.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase() || "product").slice(0, 40);
}

export type ScoringFacts = {
  product: string;
  growth: number; // 0..1 trend growth signal
  platformCount: number; // how many platforms mention it
  pains: PainPoint[];
  competitors: Competitor[];
  suppliers: Supplier[];
};

/** Returns the full program and the @output predicate to fetch. */
export function buildScoringProgram(facts: ScoringFacts): { program: string; output: string } {
  const p = slug(facts.product);
  const lines: string[] = [];

  // facts
  lines.push(`trend(${lit(p)}, ${facts.growth.toFixed(3)}, ${Math.max(1, facts.platformCount)}).`);
  for (const pain of facts.pains) {
    lines.push(`painPoint(${lit(p)}, ${lit(pain.pain)}, ${pain.severity.toFixed(3)}).`);
  }
  for (const c of facts.competitors) {
    lines.push(`competitorPain(${lit(p)}, ${lit(c.weakness)}).`);
  }
  facts.suppliers.forEach((s, i) => {
    const rel = typeof s.fitScore === "number" && s.fitScore > 0 ? Math.min(5, s.fitScore) : 4.0;
    lines.push(`supplier(${lit("s" + i)}, ${rel.toFixed(2)}, 14).`);
  });

  // rules
  lines.push(`risingTrend(T) :- trend(T, G, Pl), G > 0.6, Pl >= 2.`);
  lines.push(`strongPainPoint(T, Pa) :- painPoint(T, Pa, S), S >= 0.6.`);
  lines.push(`differentiationOpportunity(T, Pa) :- strongPainPoint(T, Pa), not competitorPain(T, Pa).`);
  lines.push(`supplierFit(S) :- supplier(S, Rel, Lead), Rel >= 4.0, Lead =< 21.`);
  lines.push(
    `stockCandidate(T) :- risingTrend(T), differentiationOpportunity(T, _), supplierFit(_).`,
  );
  lines.push(`@output("stockCandidate").`);

  return { program: lines.join("\n"), output: "stockCandidate" };
}

/**
 * Decide whether the product was derived as a stock candidate. The confirmed
 * Prometheux result shape is { results: { facts: string[][], columnNames: string[] },
 * pagination, ... } — when the product is a stockCandidate its slug appears in `facts`.
 * Scanning the stringified results for the slug is robust to that shape and any future
 * tweaks to it.
 */
export function isStockCandidate(results: unknown, product: string): boolean {
  if (!results) return false;
  const hay = JSON.stringify(results).toLowerCase();
  return hay.includes(slug(product));
}
