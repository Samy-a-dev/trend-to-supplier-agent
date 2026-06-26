# Trend-to-Supplier Commerce Agent

An autonomous product-sourcing agent. You give it a market vertical; it discovers the
hottest specific products inside it from live social / marketplace / review signals,
validates demand, mines customer pain points, designs a differentiated product variant
(with generated mockups), finds suppliers, and drafts ready-to-send RFQ emails — all
streamed live to a dashboard as it works.

```
trend discovery → demand validation → pain-point analysis → product variant
→ supplier shortlist → RFQ email drafts
```

Everything runs against real services — no mocks.

## Stack

| Concern | Tool |
|---|---|
| Agent orchestration | **Google ADK** (`@google/adk`) — a 9-step `SequentialAgent`, runs locally |
| Reasoning / extraction / drafting | **Gemini** — `gemini-3.1-pro-preview`, `gemini-3.5-flash`, `gemini-3.1-flash-lite` |
| Product mockups | **Nano Banana** — `gemini-3-pro-image`, `gemini-3.1-flash-image` |
| Scraping | **Apify** — TikTok, Amazon, Reddit actors |
| Live web search | **Tavily** — demand validation + supplier discovery |
| System of record | **ClickHouse** — 10 MergeTree tables |
| Symbolic reasoning | **Prometheux** (Vadalog) via a Python FastAPI sidecar |
| UI | **Next.js 16 + React 19** — dashboard + live SSE run view |
| Outreach | **Gmail API** — creates drafts (draft-only, never sends) |

## Architecture

Two local processes sharing ClickHouse as the system of record:

1. **Next.js app** — hosts the dashboard UI *and* the ADK engine. A Node-runtime SSE route
   (`/api/runs/stream`) runs the pipeline and streams each ADK event to the browser while
   persisting it to ClickHouse.
2. **Python sidecar** (`sidecar/main.py`) — wraps `prometheux-chain` and exposes `POST /derive`,
   running Vadalog rules with facts embedded in the program text.

Each of the 9 steps is a custom ADK `BaseAgent` that reads prior state, calls its adapter
(`lib/adapters/*`), emits progress events, and writes its result to session state.

```
app/                     dashboard, live run view, API routes (SSE stream, run detail, approve)
lib/adapters/            apify · tavily · clickhouse · gemini · prometheux · gmail
lib/agent/               pipeline (SequentialAgent) + runner + the 9 steps
lib/reasoning/vadalog.ts Vadalog program builder
lib/db/                  schema.sql + migrate + typed store
sidecar/                 Python Prometheux sidecar
scripts/                 smoke tests, one-time Gmail OAuth, CLI run
```

## Setup

Requires **Node ≥ 24.13** and **Python ≥ 3.9**.

```bash
# 1. install deps
pnpm install
python -m venv .venv && ./.venv/bin/pip install -r sidecar/requirements.txt

# 2. configure
cp .env.local.example .env.local        # fill in your keys (see below)

# 3. one-time Gmail OAuth (Desktop-app client) → prints GOOGLE_REFRESH_TOKEN
pnpm get-token

# 4. create the ClickHouse tables
pnpm db:migrate

# 5. validate every integration live (the M0 gate)
pnpm smoke

# 6. run it
pnpm sidecar      # terminal 1 — Prometheux sidecar on :8000
pnpm dev          # terminal 2 — app on :3000
```

Open the app, enter a vertical (e.g. `desk setup`), hit **Run agent**, and watch the steps
stream through to the opportunity, scores, concept images, supplier shortlist, and RFQ drafts.

## Environment

See [`.env.local.example`](.env.local.example). Keys: `APIFY_TOKEN`, `TAVILY_API_KEY`,
`CLICKHOUSE_URL` / `CLICKHOUSE_USER` / `CLICKHOUSE_PASSWORD`, `GEMINI_API_KEY`,
`PMTX_TOKEN` / `PMTX_ORG` / `PMTX_USER`, and the Gmail OAuth trio
`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REFRESH_TOKEN`.

## Notes

- **ADK runs fully locally** — no Google Cloud needed beyond the Gemini API key.
- **Prometheux** needs a running Compute Pool machine in the platform before reasoning works;
  the score step degrades gracefully if it's unavailable.
- **Gmail is draft-only** (`gmail.compose` scope) — RFQs land in Drafts and are never sent.
