# GOLD INTELLIGENCE TERMINAL V1

XAU/USD market intelligence: live radar, multi-timeframe trend scanner, non-repainting market structure, a Claude analyst writing in Egyptian Arabic, smart alerts, and an event history that tracks what happened after each alert.

**This is an analysis tool. It never places orders.** Prices are provider mid/indicative quotes, not executable bid/ask.

## Architecture

```
gold-terminal/
├── packages/core      Pure TypeScript: indicators, trend rules, market structure, alert rules,
│                      snapshot + analyst schemas (Zod), outcomes, reconciliation helpers
├── apps/server        Persistent Fastify server: MarketDataAdapter (Twelve Data / fixture), market engine,
│                      PostgreSQL repository + migrations, Claude analyst, REST + SSE API
├── apps/web           Next.js + Tailwind + TradingView Lightweight Charts terminal UI
└── fixtures/synthetic SYNTHETIC test fixtures in Twelve Data format (not market data)
```

Data flow:

1. **History.** At startup the server fetches 1,000 closed bars per timeframe (1m, 5m, 15m, 1h, 4h, 1d) from Twelve Data REST with `timezone=UTC`. EMA200 is treated as warmed up only after 600 bars.
2. **Streaming.** The Twelve Data WebSocket price stream updates the Live Radar and the provisional *forming* candle. A streamed update is a snapshot of the current price, not a tick. Repeats and out-of-order frames are counted and ignored. No volume is ever derived from stream messages.
3. **Confirmation.** After each minute closes, plus `RECONCILE_DELAY_SEC`, the server asks the REST API for the closed 1m bars. Only provider-returned closed bars become `confirmed`.
   - 5m and 15m are `derived`: aggregated from confirmed 1m bars.
   - 1h, 4h and 1d are fetched natively at each close (`NATIVE_CONFIRM_TIMEFRAMES`). They fall back to 1m-derived bars only after repeated failures, and the UI flags it when that happens.
   - When the provider later reports different values for a stored bar, the bar is overwritten and the correction is logged in `candle_revisions`.
4. **Signals.** Trend states, structure events and alerts are computed only on closed candles.
5. **Claude.** Claude receives a Zod-validated snapshot computed in code and must answer with structured JSON. That JSON is validated again by Zod and by semantic checks before anything is shown.

### Data integrity rules

- UTC everywhere internally. The UI displays Africa/Cairo.
- Nothing is fabricated: no synthetic prices, candles, volume (`NULL` when the provider has none), bid/ask or signals. Missing data shows as missing.
- Live and fixture data are stored separately (`data_origin`), and fixture data is labelled in every view.
- Gaps are detected against the XAU/USD session calendar (Sunday 18:00 to Friday 17:00 New York time, daily break 17:00–18:00 ET, DST-aware). Each gap gets one backfill attempt and is recorded in `data_gaps`.
- When the provider's quote reports the market closed during scheduled hours (e.g. a holiday), the provider wins.
- Rate limits:
  - A local credit budget (per minute and per day) is enforced before any request.
  - An upstream 429 blocks further calls until it clears.
  - When the budget runs out, signals are delayed, never invented.
- Reconnects use exponential backoff with jitter, plus a silence watchdog and heartbeats.

### Market structure: no repainting, no lookahead

A swing at bar *i* is confirmed only after bar *i+3* closes, and it is stamped with that close time. BOS and CHoCH need a close beyond the latest unbroken swing. Breakouts need a close past a level that existed *before* the bar, plus an ATR buffer. Retests and failed breakouts are evaluated on later bars.

Tests prove that analysing any prefix of the history yields exactly the events of the full analysis.

### Claude analyst

- **Input.** Timestamps, price source and freshness, session, per-timeframe EMA20/50/200, RSI14, ATR14, objective trend states with the rules behind them, structure events, and a closed list of **references** (levels, swings, EMAs, price), each with an id.
- **Output** (`client.beta.messages.parse` + `betaZodOutputFormat`): bias, Arabic summary, bullish/bearish scenarios that cite *reference ids* for trigger, invalidation, targets and evidence, plus conflicting signals, WAIT conditions, and an action (`WAIT` / `MONITOR_*`). There is no confidence field.
- **Rejected** outputs:
  - an unknown reference
  - incoherent geometry (e.g. a bullish invalidation above the trigger)
  - any percentage
  - any price-like number that is not in the snapshot

  The rejection is stored and displayed instead of the analysis.
- **When it runs.** Claude is called on a manual refresh, or automatically on BOS/CHoCH or a trend change on `ANALYST_TRIGGER_TIMEFRAMES` when `ANALYST_AUTO_ENABLED=true`.
- **Limits.**
  - Manual and automatic cooldowns.
  - Daily caps on calls and on estimated USD, persisted in the database so restarts don't reset them.
  - A single call in flight at a time.
- **Skipped** (not sent): stale prices, fixture snapshots (unless `ANALYST_ALLOW_FIXTURE=true`), and snapshots with no warmed-up timeframe.
- **Model.** Default `claude-opus-5-5` at `effort: medium`, with server-side refusal fallbacks (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`; turn off with `ANALYST_USE_FALLBACKS=false`).

### Alerts and history

Rule types (all evaluated on confirmed closes):

- `candle_close`, with an optional above/below condition
- `level_cross`, at a manual price or on detected S/R breakouts
- `structure_break` (BOS/CHoCH)
- `trend_change`

Each alert has a deterministic dedupe key (rule | timeframe | candle | subject) with a unique constraint, plus a per-rule cooldown. Every alert stores a reference to the exact input snapshot (with its SHA-256). Outcomes at +15m, +1h, +4h and +24h are measured afterwards from confirmed 1m bars: close change, max high and min low. Five starter rules are created on first run; edit or delete them in the UI.

## Setup

Requirements: Node 22+, PostgreSQL 16 (or Docker).

### Docker Compose

```bash
cd gold-terminal
cp .env.example .env          # set TWELVEDATA_API_KEY and ANTHROPIC_API_KEY
docker compose up --build
# web http://localhost:3000 · API http://localhost:4000
```

### Local development

```bash
cd gold-terminal
npm install
cp .env.example apps/server/.env      # fill in keys; DATABASE_URL to your Postgres
npm run db:migrate                    # also runs automatically at server start
npm run dev:server                    # :4000
npm run dev:web                       # :3000 (set NEXT_PUBLIC_API_BASE if the API is elsewhere)
```

Without `DATABASE_URL` the server uses in-memory storage and warns. Without `TWELVEDATA_API_KEY` it runs but reports `no_credentials` and shows no prices.

### Offline UI development (fixture replay)

```bash
DATA_MODE=fixture FIXTURE_SPEED=10 npm run dev:server
```

This replays `fixtures/synthetic` on a virtual clock, starting from the fixture's replay start. The UI shows a permanent **DEMO REPLAY — not live** banner, and every record is stored with `data_origin='fixture'`. The synthetic fixtures are a seeded random walk (`scripts/generate-synthetic-fixtures.ts`). They are **not market data**.

To replay real data, record it with your key (`npm run fixtures:record -- --minutes=20`) and point `FIXTURE_DIR` at `fixtures/recorded/<timestamp>`. Recordings are git-ignored; check Twelve Data's terms before sharing them.

## Testing

```bash
npm run typecheck                      # core, server, web
npm test                               # unit tests (core + server)
DATABASE_URL=postgres://… npm run test:integration   # adapter/engine/API + PostgreSQL
npm run connectivity                   # REAL provider check: Twelve Data REST + WebSocket, Anthropic model
```

The integration tests drive the real `TwelveDataAdapter` against a mock REST endpoint and a local WebSocket server. Both serve Twelve Data-format fixtures *as of a virtual clock*, so the code under test cannot see future bars. The tests cover:

- history initialisation and the WebSocket subscription
- duplicate detection
- REST reconciliation and alert dedupe
- 5m derivation and native 1h confirmation
- 429 backoff
- reconnects and auth failures
- the full HTTP/SSE API
- the PostgreSQL repository (skipped when `DATABASE_URL` is unset)

Claude is replaced by a stand-in that answers using only references present in the snapshot it receives.

## Twelve Data plan notes

- Each REST call costs 1 credit. The free Basic plan (8/min, 800/day) cannot confirm a 1m bar every minute for a full trading day (≈1,380 bars). On that plan, set `RECONCILE_INTERVAL_SEC=180` or more: confirmed signals then arrive later, but never early or fabricated.
- WebSocket access for XAU/USD depends on your plan. `npm run connectivity` tells you whether price events arrive. `PRICE_POLL_INTERVAL_SEC` enables REST `/price` polling while the stream is down; that costs credits, and the polled price has no provider timestamp, so its latency shows as unknown.
- Twelve Data does not provide volume for XAU/USD, and its stream carries no bid/ask for it. The UI says so instead of showing zeros.

## API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | mode, database, feed and analyst status |
| GET | `/api/state` | price view, engine status, analyst budget |
| GET | `/api/candles?tf=1h&limit=500` | closed candles, forming bar, EMA series, swings, events, levels |
| GET | `/api/trend` | all timeframe trend readings |
| GET | `/api/snapshot` | current analyst input snapshot |
| POST | `/api/analysis/refresh` | manual Claude analysis (cooldown and caps apply) |
| GET | `/api/analysis` | recent analyses + budget |
| GET/POST/PUT/DELETE | `/api/alerts/rules[/:id]` | alert rules |
| GET | `/api/alerts/events` · POST `/api/alerts/events/:id/ack` | alert feed |
| GET | `/api/history[/:id]` | alerts with outcomes; detail includes the input snapshot |
| GET | `/api/snapshots/:id` | stored snapshot |
| GET | `/api/stream` | SSE: `price`, `status`, `close`, `alert`, `analysis`, `gap` |

Mutating endpoints have no authentication. Run the API behind your own reverse proxy and auth before exposing it beyond localhost. The server-side cost caps bound Claude spend either way.
