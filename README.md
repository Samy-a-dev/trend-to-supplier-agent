# Trend-to-Supplier Commerce Agent

This repo is a product-sourcing arcade cabinet for ecommerce builders.

You feed it a market vertical, like `desk setup`, `home fitness`, or `pet
accessories`. It grabs live internet signals, argues with the evidence, designs a
better private-label product, finds suppliers, and drafts outreach. The dashboard
shows the whole run as it happens, so the agent is not a mystery box.

```text
vertical -> trend signals -> product opportunity -> demand proof -> suppliers
-> score -> variant mockups -> RFQ drafts -> saved report
```

The short version: this is a tiny product research team, supplier scout, concept
designer, analyst, and RFQ writer running inside one workflow.

Everything runs against real services. No mock data is supposed to carry the story.

## Problem Statement

Launching an ecommerce product is still weirdly manual.

A founder usually has to bounce between TikTok, Reddit, Amazon, Google, supplier
marketplaces, spreadsheets, AI chats, and email. The work is repetitive, but the
judgment is not: you need to know whether people actually want the product, what
they hate about existing options, whether the category is too crowded, whether a
supplier can make a better version, and what to ask before wasting money on samples.

The core problem this repo attacks:

```text
How do we turn a vague ecommerce idea into a sourced, evidence-backed product bet
without spending days manually researching, scraping, scoring, and drafting outreach?
```

## Why Ecommerce Still Has Untapped Space

Ecommerce is huge, but it is not "solved."

In the U.S., ecommerce was still only 16.9 percent of total retail sales in Q1 2026
on a seasonally adjusted basis, according to the U.S. Census Bureau's Quarterly
Retail E-Commerce Sales report and the same Census series mirrored by FRED. That
means most retail spending is still offline, while online discovery keeps getting
faster. Globally, the International Trade Administration expects B2C ecommerce
revenue to keep growing toward $5.5 trillion by 2027.

The untapped part is not "start another generic store." That game is crowded. The
untapped part is micro-opportunity discovery:

- products with rising demand before everyone copies them
- categories where reviews reveal obvious fixable complaints
- physical products that can be improved with one or two smart feature changes
- supplier niches where OEM/private-label options exist but are hard to find
- boring categories with loud customer pain and weak differentiation

This agent is built for that gap. It does not try to predict all of ecommerce. It
hunts for specific, buyable product wedges where the internet is already dropping
clues.

## Benefits

Running the agent gives you:

- a focused product opportunity instead of a vague vertical
- customer pain points pulled from live social, marketplace, and discussion signals
- demand validation from current web search
- a supplier shortlist for OEM or private-label sourcing
- numeric scores for trend, demand, pain, differentiation, margin, risk, and supplier
  fit
- a symbolic `stockCandidate` verdict from Prometheux reasoning
- generated product concept images
- RFQ emails ready for human approval
- a persistent audit trail in ClickHouse, so the run can be replayed later

## How It Works

The home page creates a `run_...` id and sends you to `/runs/{id}`. If the URL has
`autostart=1`, the run page opens a POST stream to `/api/runs/stream`.

That route starts `runPipeline()` in `lib/agent/runner.ts`. The runner creates a
Google ADK session, executes the pipeline, streams each event back to the browser,
and persists the same event into ClickHouse.

The current pipeline order is:

```text
discover -> ingest -> extract -> corroborate -> suppliers -> score
-> variant -> draft -> report
```

## Sponsor Tech Tour

### Google ADK: the conductor

Google ADK is the workflow engine. The app builds a `SequentialAgent` in
`lib/agent/pipeline.ts`, then plugs in nine custom `PipelineStep` agents.

Each step is an ADK `BaseAgent`. It can:

- read earlier outputs from session state
- emit progress events
- write state deltas for later steps
- fail critically or degrade gracefully, depending on the step

The runner in `lib/agent/runner.ts` normalizes ADK events into app-level run events,
streams them to the dashboard, and writes them to `run_events`.

### Gemini: the structured brain

Gemini handles the fuzzy reasoning and turns messy text into typed JSON. It is used
for:

- discovery planning: hashtags, Amazon searches, Reddit phrases, web validation
- opportunity extraction from scraped signals
- supplier shortlist extraction from Tavily search hits
- numeric scoring axes
- variant spec generation
- RFQ email drafting

The adapter in `lib/adapters/gemini.ts` does not just ask for "some JSON" and hope.
It converts Zod schemas to Gemini response schemas, parses the response, validates it,
and retries with a repair prompt if the first answer is invalid.

### Nano Banana / Gemini Image: the concept artist

After the variant step invents the private-label product, Gemini image models render
the visual concept set.

Current outputs:

- hero product shot
- packaging mockup
- lifestyle image

The images are written into `public/generated`, and the UI displays them through
normal public Next.js paths like `/generated/run_...-hero.png`.

### Apify: the market signal collector

Apify collects raw signals from places where product demand shows up before it looks
obvious in a spreadsheet.

The ingest step currently calls:

- TikTok hashtag scraping
- Amazon product listing scraping
- Reddit post/comment scraping

Those records become `rawSignals`, then Gemini reads the compacted version to infer
which product is worth chasing, what customers complain about, what competitors miss,
and what price range appears in the market.

The Apify adapter also has token failover for credit or quota issues:
`APIFY_TOKEN`, then `APIFY_TOKEN_BACKUP`, then `APIFY_TOKEN_BACKUP2`.

### Tavily: the open-web scout

Tavily has two jobs.

First, `corroborate` validates demand for the chosen opportunity. It searches recent
web and news results, returns source snippets, and can provide a synthesized answer.
Those sources are stored as trend observations.

Second, `suppliers` searches wholesale and manufacturer domains:

- `alibaba.com`
- `made-in-china.com`
- `thomasnet.com`
- `globalsources.com`

Gemini then turns the Tavily hits into structured supplier candidates with country,
MOQ, capabilities, and fit score.

### ClickHouse: the memory palace

ClickHouse is the system of record. It stores both the final answer and the path the
agent took to get there.

Important tables:

- `agent_runs`: run status and top product
- `run_events`: every streamed event
- `trend_observations`: TikTok, Reddit, and Tavily evidence
- `marketplace_listings`: Amazon products
- `review_insights`, `customer_pain_points`, `competitor_products`: extracted insight
  tables
- `supplier_candidates`: supplier shortlist
- `product_opportunities`: final sourced opportunity
- `outreach_emails`: RFQ drafts and Gmail draft status

Most observation tables are append-only `MergeTree` tables. Mutable records use
`ReplacingMergeTree`, so the app writes full replacement rows and reads with `FINAL`.

### Prometheux: the rule judge

Prometheux handles symbolic reasoning. The TypeScript side builds a Vadalog program
from the opportunity:

- trend growth
- number of platforms with signals
- pain points
- competitor weaknesses
- supplier fit facts

Then the Node app sends the program to the Python sidecar at `POST /derive`. The
sidecar uses `prometheux-chain` to save the project, run the concept, and fetch the
derived rows.

The key derived predicate is:

```text
stockCandidate(Product)
```

If Prometheux is unavailable, the score step logs a warning and keeps going with the
Gemini numeric score. That keeps the demo resilient without hiding that the symbolic
reasoning path failed.

### Gmail: the human-approved send-off

Gmail is intentionally not an auto-sender. The agent drafts RFQ emails and stores them
in ClickHouse first.

When a human clicks "Approve -> Gmail draft", `/api/outreach/approve` loads the draft,
uses the Gmail API with the `gmail.compose` scope, creates a real Gmail draft, and
updates the ClickHouse row to `drafted_in_gmail`.

## Stack

| Concern | Tool |
|---|---|
| Agent orchestration | Google ADK (`@google/adk`) |
| Reasoning / extraction / drafting | Gemini (`gemini-3.1-pro-preview`, `gemini-3.5-flash`, `gemini-3.1-flash-lite`) |
| Product mockups | Nano Banana / Gemini image models (`gemini-3-pro-image`, `gemini-3.1-flash-image`) |
| Scraping | Apify TikTok, Amazon, and Reddit actors |
| Live web search | Tavily demand validation and supplier discovery |
| System of record | ClickHouse MergeTree tables |
| Symbolic reasoning | Prometheux Vadalog through a Python FastAPI sidecar |
| UI | Next.js 16 and React 19 |
| Outreach | Gmail API draft creation |

## Architecture

Two local processes share ClickHouse as the system of record:

1. The Next.js app hosts the dashboard UI and the ADK engine. A Node-runtime SSE route
   at `/api/runs/stream` runs the pipeline and streams each ADK event to the browser
   while persisting it to ClickHouse.
2. The Python sidecar at `sidecar/main.py` wraps `prometheux-chain` and exposes
   `POST /derive`, running Vadalog rules with facts embedded in the program text.

Project map:

```text
app/                     dashboard, live run view, API routes
lib/adapters/            apify, tavily, clickhouse, gemini, prometheux, gmail
lib/agent/               pipeline, runner, and the 9 steps
lib/reasoning/vadalog.ts Vadalog program builder
lib/db/                  schema.sql, migrate, typed store
sidecar/                 Python Prometheux sidecar
scripts/                 smoke tests, Gmail OAuth, CLI run
```

## Current Implementation Notes

This section is useful if you are comparing the repo to an older workflow writeup:

- Supplier discovery runs before scoring, so Prometheux and Gemini can judge supplier
  fit from real candidates.
- The active runner is `runPipeline()` in `lib/agent/runner.ts`.
- Concept images are written to `public/generated`.
- The main ingest step currently uses TikTok, Amazon product listings, and Reddit.
  The Apify adapter has an Amazon reviews helper, but it is not wired into the main
  pipeline.
- The Apify actor helper expects the main actor calls to finish with `SUCCEEDED`.

## Setup

Requires Node >= 24.13 and Python >= 3.9.

```bash
pnpm install
python -m venv .venv
./.venv/bin/pip install -r sidecar/requirements.txt
cp .env.local.example .env.local
pnpm db:migrate
pnpm smoke
pnpm dev:all
```

Or run the two long-lived processes separately:

```bash
pnpm sidecar
pnpm dev
```

Open the app, enter a vertical, hit "Run agent", and watch the steps stream through
to the opportunity, scores, concept images, supplier shortlist, and RFQ drafts.

## Environment

See `.env.local.example`.

Required groups:

- Apify: `APIFY_TOKEN`
- Tavily: `TAVILY_API_KEY`
- ClickHouse: `CLICKHOUSE_URL`, `CLICKHOUSE_USER`, `CLICKHOUSE_PASSWORD`
- Gemini: `GEMINI_API_KEY`
- Prometheux: `PMTX_TOKEN`, `PMTX_ORG`, `PMTX_USER`, `SIDECAR_URL`
- Gmail: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`

For Gmail OAuth, run:

```bash
pnpm get-token
```

## Observability

Every external call is logged so you can watch the real analysis, not a black box:

- Live dashboard Activity panel: each step emits structured tool events with a
  colored badge per sponsor.
- `pnpm dev` terminal: adapters print tagged lines through `lib/log.ts`, such as
  `[TAVILY] search:demand`, `[CLICKHOUSE] INSERT`, and `[PROMETHEUX] derive`.
- `pnpm sidecar` terminal: `sidecar/main.py` echoes the Vadalog program and each
  Prometheux derivation step.
- ClickHouse `run_events` table: every event and tool detail is persisted, so a
  finished run can replay with the same breakdown.

## Market Sources

- U.S. Census Bureau: Quarterly Retail E-Commerce Sales Report:
  https://www.census.gov/retail/ecommerce.html
- FRED, Federal Reserve Bank of St. Louis: E-Commerce Retail Sales as a Percent of
  Total Sales:
  https://fred.stlouisfed.org/series/ECOMPCTSA
- International Trade Administration: eCommerce Sales and Size Forecast:
  https://www.trade.gov/ecommerce-sales-size-forecast

## Safety Notes

- ADK runs locally. You only need external credentials for the services the pipeline
  actually calls.
- Prometheux needs an available Compute Pool machine before symbolic reasoning can
  succeed. If it is unavailable, scoring continues with a warning.
- Gmail is draft-only with the `gmail.compose` scope. The app creates drafts; it does
  not send emails automatically.
