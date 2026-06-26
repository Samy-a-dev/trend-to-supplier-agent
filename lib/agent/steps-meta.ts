/** Step ids + labels, shared by the pipeline and the UI (no server-only imports). */
export const STEP_META: { id: string; label: string }[] = [
  { id: "discover", label: "Discover" },
  { id: "ingest", label: "Ingest signals" },
  { id: "extract", label: "Extract opportunity" },
  { id: "corroborate", label: "Validate demand" },
  { id: "suppliers", label: "Find suppliers" },
  { id: "score", label: "Score" },
  { id: "variant", label: "Design variant" },
  { id: "draft", label: "Draft RFQs" },
  { id: "report", label: "Report" },
];

export const STEP_IDS = STEP_META.map((s) => s.id);
