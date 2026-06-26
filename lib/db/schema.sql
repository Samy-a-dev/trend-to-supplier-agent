-- ClickHouse schema for the sourcing agent. Append-only MergeTree tables.
-- Statements are split on ';' by migrate.ts, so keep one statement per block and
-- avoid semicolons inside comments.

CREATE TABLE IF NOT EXISTS trend_observations (
  id          UUID DEFAULT generateUUIDv4(),
  run_id      String,
  source      LowCardinality(String),
  url         String DEFAULT '',
  topic       String DEFAULT '',
  captured_at DateTime64(3, 'UTC') DEFAULT now64(3),
  payload     String DEFAULT '{}'
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(captured_at)
ORDER BY (run_id, source, captured_at);

CREATE TABLE IF NOT EXISTS marketplace_listings (
  id           UUID DEFAULT generateUUIDv4(),
  run_id       String,
  source       LowCardinality(String),
  url          String DEFAULT '',
  product      String DEFAULT '',
  asin         String DEFAULT '',
  price_cents  Int64 DEFAULT 0,
  rating       Float32 DEFAULT 0,
  review_count Int64 DEFAULT 0,
  captured_at  DateTime64(3, 'UTC') DEFAULT now64(3),
  payload      String DEFAULT '{}'
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(captured_at)
ORDER BY (run_id, source, captured_at);

CREATE TABLE IF NOT EXISTS review_insights (
  id          UUID DEFAULT generateUUIDv4(),
  run_id      String,
  source      LowCardinality(String),
  url         String DEFAULT '',
  product     String DEFAULT '',
  theme       String DEFAULT '',
  sentiment   String DEFAULT '',
  frequency   Int64 DEFAULT 0,
  captured_at DateTime64(3, 'UTC') DEFAULT now64(3),
  payload     String DEFAULT '{}'
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(captured_at)
ORDER BY (run_id, product, captured_at);

CREATE TABLE IF NOT EXISTS customer_pain_points (
  id             UUID DEFAULT generateUUIDv4(),
  run_id         String,
  product        String DEFAULT '',
  pain           String DEFAULT '',
  severity       Float32 DEFAULT 0,
  evidence_count Int64 DEFAULT 0,
  captured_at    DateTime64(3, 'UTC') DEFAULT now64(3),
  payload        String DEFAULT '{}'
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(captured_at)
ORDER BY (run_id, product, captured_at);

CREATE TABLE IF NOT EXISTS competitor_products (
  id          UUID DEFAULT generateUUIDv4(),
  run_id      String,
  product     String DEFAULT '',
  competitor  String DEFAULT '',
  weakness    String DEFAULT '',
  url         String DEFAULT '',
  captured_at DateTime64(3, 'UTC') DEFAULT now64(3),
  payload     String DEFAULT '{}'
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(captured_at)
ORDER BY (run_id, product, captured_at);

CREATE TABLE IF NOT EXISTS supplier_candidates (
  id           UUID DEFAULT generateUUIDv4(),
  run_id       String,
  name         String DEFAULT '',
  url          String DEFAULT '',
  country      String DEFAULT '',
  moq          String DEFAULT '',
  capabilities String DEFAULT '',
  fit_score    Float32 DEFAULT 0,
  captured_at  DateTime64(3, 'UTC') DEFAULT now64(3),
  payload      String DEFAULT '{}'
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(captured_at)
ORDER BY (run_id, captured_at);

-- Mutable: a row is re-inserted with a higher updated_at to update status.
-- Read with FINAL (or argMax) to collapse to the latest version. id is app-supplied.
CREATE TABLE IF NOT EXISTS product_opportunities (
  id                    String,
  run_id                String,
  product               String DEFAULT '',
  summary               String DEFAULT '',
  trend_strength        Float32 DEFAULT 0,
  demand_quality        Float32 DEFAULT 0,
  pain_intensity        Float32 DEFAULT 0,
  saturation            Float32 DEFAULT 0,
  differentiation       Float32 DEFAULT 0,
  supplier_fit          Float32 DEFAULT 0,
  margin_potential      Float32 DEFAULT 0,
  sourcing_risk         Float32 DEFAULT 0,
  variant_spec          String DEFAULT '',
  image_paths           Array(String) DEFAULT [],
  status                LowCardinality(String) DEFAULT 'open',
  captured_at           DateTime64(3, 'UTC') DEFAULT now64(3),
  updated_at            DateTime64(3, 'UTC') DEFAULT now64(3),
  payload               String DEFAULT '{}'
)
ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (run_id, id);

-- Mutable: status flips draft -> drafted_in_gmail when a Gmail draft is created.
CREATE TABLE IF NOT EXISTS outreach_emails (
  id             String,
  run_id         String,
  supplier_name  String DEFAULT '',
  to_email       String DEFAULT '',
  subject        String DEFAULT '',
  body           String DEFAULT '',
  status         LowCardinality(String) DEFAULT 'draft',
  gmail_draft_id String DEFAULT '',
  captured_at    DateTime64(3, 'UTC') DEFAULT now64(3),
  updated_at     DateTime64(3, 'UTC') DEFAULT now64(3)
)
ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (run_id, id);

-- Mutable: status flips running -> succeeded/failed at run end.
CREATE TABLE IF NOT EXISTS agent_runs (
  run_id       String,
  vertical     String DEFAULT '',
  region       String DEFAULT '',
  status       LowCardinality(String) DEFAULT 'running',
  top_product  String DEFAULT '',
  error        String DEFAULT '',
  started_at   DateTime64(3, 'UTC') DEFAULT now64(3),
  finished_at  Nullable(DateTime64(3, 'UTC')),
  updated_at   DateTime64(3, 'UTC') DEFAULT now64(3),
  payload      String DEFAULT '{}'
)
ENGINE = ReplacingMergeTree(updated_at)
ORDER BY run_id;

CREATE TABLE IF NOT EXISTS run_events (
  run_id  String,
  ts      DateTime64(3, 'UTC') DEFAULT now64(3),
  step    LowCardinality(String) DEFAULT '',
  kind    LowCardinality(String) DEFAULT 'info',
  message String DEFAULT '',
  data    String DEFAULT '{}'
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(ts)
ORDER BY (run_id, ts);

CREATE TABLE IF NOT EXISTS scrape_cache (
  cache_key   String,
  slug        LowCardinality(String),
  vertical    String DEFAULT '',
  source      LowCardinality(String) DEFAULT '',
  items       String DEFAULT '[]',
  item_count  Int64 DEFAULT 0,
  captured_at DateTime64(3, 'UTC') DEFAULT now64(3)
)
ENGINE = ReplacingMergeTree(captured_at)
ORDER BY (slug, vertical, source, cache_key);
