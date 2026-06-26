/** Domain types shared across the pipeline steps, persistence, and UI. */

export type DiscoveryPlan = {
  tiktokHashtags: string[];
  amazonQueries: string[];
  redditSearches: string[];
  webValidationQueries: string[];
};

export type RawSignals = {
  tiktok: Record<string, unknown>[];
  amazonProducts: Record<string, unknown>[];
  amazonReviews: Record<string, unknown>[];
  reddit: Record<string, unknown>[];
};

export type PainPoint = {
  product: string;
  pain: string;
  severity: number; // 0..1
  evidenceCount: number;
};

export type Competitor = {
  product: string;
  competitor: string;
  weakness: string;
  url?: string;
};

export type ReviewInsight = {
  product: string;
  theme: string;
  sentiment: "positive" | "negative" | "neutral";
  frequency: number;
};

export type Opportunity = {
  product: string; // short canonical key, e.g. "compact_walking_pad"
  title: string;
  summary: string;
  rationale: string;
  painPoints: PainPoint[];
  competitors: Competitor[];
  reviewInsights: ReviewInsight[];
  priceLowCents?: number;
  priceHighCents?: number;
};

export type Evidence = {
  answer: string;
  sources: { title: string; url: string; snippet?: string }[];
};

export type Scores = {
  trendStrength: number;
  demandQuality: number;
  painIntensity: number;
  saturation: number;
  differentiation: number;
  supplierFit: number;
  marginPotential: number;
  sourcingRisk: number;
  stockCandidate: boolean;
  derived?: unknown; // raw Prometheux results, for transparency
};

export type VariantConcept = {
  name: string;
  spec: string;
  features: string[];
  colorways: string[];
  imagePaths: string[];
};

export type Supplier = {
  name: string;
  url: string;
  country?: string;
  moq?: string;
  capabilities?: string;
  fitScore?: number;
};

export type OutreachEmail = {
  id: string;
  supplierName: string;
  toEmail: string;
  subject: string;
  body: string;
  status: "draft" | "drafted_in_gmail";
  gmailDraftId?: string;
};

/** Keys used in ADK session state to pass data between steps. */
export const STATE = {
  vertical: "vertical",
  region: "region",
  runId: "runId",
  discoveryPlan: "discoveryPlan",
  rawSignals: "rawSignals",
  opportunity: "opportunity",
  evidence: "evidence",
  scores: "scores",
  variant: "variant",
  suppliers: "suppliers",
  emails: "emails",
} as const;
