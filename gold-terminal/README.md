# GOLD INTELLIGENCE TERMINAL V1

Market intelligence for the **Binance USDⓈ-M Futures XAUUSDT perpetual** (Gold/USDT TradFi perpetual): live radar with real order-book bid/ask, mark/index, funding and open interest, a multi-timeframe trend scanner, non-repainting market structure, a Claude analyst writing in Egyptian Arabic, smart alerts, an event history that tracks what happened after each alert, and a USDT position-sizing calculator built on the live contract specification.

**This is an analysis tool. It never places orders and uses no exchange API keys.** All prices, levels, risk and P&L are in USDT. XAUUSDT is the only instrument: spot XAU/USD, PAXGUSDT or XAUTUSDT prices are never used or substituted.

## Architecture

```
gold-terminal/
├── packages/core      Pure TypeScript: indicators, trend rules, market structure, alert rules,
│                      snapshot + analyst schemas (Zod), outcomes, reconciliation, contract spec +
│                      USDT position sizing, TradFi index regime
├── apps/server        Persistent Fastify server: MarketDataAdapter (Binance USDⓈ-M / fixture), market engine,
│                      PostgreSQL repository + migrations, Claude analyst, REST + SSE API
├── apps/web           Next.js + Tailwind + TradingView Lightweight Charts terminal UI
└── fixtures/synthetic SYNTHETIC test fixtures in Binance response format (not market data)
```

Data flow:

1. **Contract.** At startup the server reads `/fapi/v1/exchangeInfo` and validates XAUUSDT: base `XAU`, quote and margin `USDT`, a perpetual contract type, tick and lot filters present. If it is missing or different, the feed stops with a visible error; no other symbol is tried. The spec is re-read every `CONTRACT_REFRESH_SEC`, and its `status` decides whether the contract is trading.
2. **History.** 1,000 closed klines per timeframe (1m, 5m, 15m, 1h, 4h, 1d) from `/fapi/v1/klines`. EMA200 counts as warmed up only after 600 bars. XAUUSDT is a young contract, so 1d may stay in **warm-up** until enough daily bars exist; it is never padded with another instrument's history.
3. **Initial sync.** Order book (`/fapi/v1/depth`, `/fapi/v1/ticker/bookTicker`), mark/index/funding (`/fapi/v1/premiumIndex`), 24h ticker, open interest (plus `/futures/data/openInterestHist` for the 1h change), funding schedule (`/fapi/v1/fundingInfo`, otherwise inferred from `/fapi/v1/fundingRate` spacing), index constituents (`/fapi/v1/constituents`) and server time (clock-offset correction). The same sync re-runs after every reconnect.
4. **Streaming.** Two combined-stream WebSocket connections:
   - market (`BINANCE_WS_MARKET_URL`, default `wss://fstream.binance.com/market/stream`): `aggTrade`, `markPrice@1s`, `ticker`, and klines for all six timeframes;
   - book (`BINANCE_WS_BOOK_URL`): `bookTicker` and `depth20@100ms`.

   Each aggTrade is a real trade. Mark, book, depth and ticker frames are exchange snapshots and are never counted as trades. Open interest has no stream and is polled every `OPEN_INTEREST_POLL_SEC`.
5. **Confirmation.**
   - A kline the exchange marks final (`x: true`) is ingested at once as a confirmed bar.
   - 1m bars are also reconciled over REST every minute (after `RECONCILE_DELAY_SEC`), which backfills anything missed during a disconnect.
   - Higher timeframes in `NATIVE_CONFIRM_TIMEFRAMES` are cross-checked over REST after each close.
   - Any difference overwrites the stored bar and is logged in `candle_revisions`.
6. **Signals.** Trend states, structure events and alerts are computed only on closed candles.
7. **Claude.** Claude receives a Zod-validated snapshot computed in code, now including the contract, mark/index/basis, funding, open interest, top of book and the index regime. It must answer with structured JSON, which is validated again by Zod and by semantic checks before anything is shown.

### Data integrity rules

- UTC everywhere internally. The UI displays Africa/Cairo.
- Nothing is fabricated: no synthetic prices, candles, volume, bid/ask or signals. Volume is the exchange-reported base volume (a real `0` when nothing traded). Missing data shows as missing.
- Live and fixture data are stored separately (`data_origin`), and fixture data is labelled in every view.
- Frames for any symbol other than XAUUSDT are dropped.
- **Stale data:**
  - Each stream has its own staleness threshold (mark 5s, depth 5s, ticker 10s, bookTicker 30s, kline 30s). Trades may legitimately pause, so a quiet trade stream is shown as "quiet", not stale.
  - Feed freshness uses the latest message on any stream, and the UI shows the age of the last trade separately.
  - Stale streams appear in the data-quality list and in the analyst snapshot.
- **Connection monitoring:**
  - Each connection reconnects with exponential backoff and jitter.
  - A silence watchdog forces a reconnect after 15s without frames.
  - Connections rotate before Binance's 24h limit. Binance pings are answered automatically.
- **Rate limits:**
  - A request-weight budget per endpoint, using Binance's published weights, is enforced locally against `BINANCE_WEIGHT_SAFETY` × the per-minute `REQUEST_WEIGHT` limit from exchangeInfo.
  - The server's `X-MBX-USED-WEIGHT-1M` header is tracked.
  - A 429 or a 418 (IP ban) blocks all REST calls until its `Retry-After` passes. A 451 (restricted location) is reported as such.
  - Signals are delayed, never invented.
- Gaps (missing klines while the contract is trading) get one backfill attempt and are recorded in `data_gaps`.

### TradFi sessions and the index regime

XAUUSDT trades on Binance outside traditional gold-market hours. The Binance trading status (`TRADING` versus anything else in exchangeInfo) decides whether the contract is trading. The underlying gold market is different: the index price is computed from underlying-market prices while that market is open, and with Binance's off-hours method during weekends, the daily break and holidays. The app reports this as the **index regime**:

- **`underlying_hours`:** the scheduled gold session is open (Sunday 18:00 to Friday 17:00 New York time, minus the 17:00–18:00 daily break, DST-aware).
- **`off_hours`:** outside that schedule, *or* the index price has not changed for 10 minutes during scheduled hours. The second case is a data-driven check for holidays the calendar doesn't know about.

The regime, the index constituents Binance reports, and the mark/index/basis values are shown in the UI and sent to Claude. Claude is told to treat off-hours moves, basis and breakouts with extra caution.

### Position sizing (USDT)

The sizer (`sizePosition` in `packages/core`) uses the live contract spec from exchangeInfo:

- Prices are rounded to the tick size.
- Quantity is floored to the `LOT_SIZE` or `MARKET_LOT_SIZE` step, capped at the max quantity, and checked against the minimum quantity and minimum notional.
- Quantity is in XAU (USDⓈ-M linear: notional = quantity × price).

You enter equity, risk %, entry, stop, targets, leverage and an assumed fee per side. It returns:

- the quantity, notional and initial margin
- the loss at the stop, including entry and exit fees
- the net P&L and R multiple at each target, all in USDT

Claude scenarios have a **Use in sizer** button that prefills trigger, invalidation and targets. Your actual fee tier and liquidation price need private account data (fee rate and maintenance-margin brackets), so they are not computed; the sizer says so. There is no order button.

### Market structure: no repainting, no lookahead

A swing at bar *i* is confirmed only after bar *i+3* closes, and it is stamped with that close time. BOS and CHoCH need a close beyond the latest unbroken swing. Breakouts need a close past a level that existed *before* the bar, plus an ATR buffer. Retests and failed breakouts are evaluated on later bars.

Tests prove that analysing any prefix of the history yields exactly the events of the full analysis.

### Claude analyst

- **Input.** Timestamps, last-trade price and feed freshness, contract and trading status, per-timeframe EMA20/50/200, RSI14, ATR14, objective trend states with the rules behind them, structure events, mark/index/basis, funding, open interest, top of book, the index regime, and a closed list of **references** (levels, swings, EMAs, `PRICE`, `MARK`, `INDEX`), each with an id and a USDT price.
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
cp .env.example .env          # set ADMIN_API_TOKEN, and ANTHROPIC_API_KEY for the analyst; Binance needs no key
docker compose up --build
# web http://localhost:3000 · API http://localhost:4000
```

### Local development

```bash
cd gold-terminal
npm install
cp .env.example apps/server/.env      # ADMIN_API_TOKEN, optional ANTHROPIC_API_KEY, DATABASE_URL
npm run db:migrate                    # also runs automatically at server start
npm run dev:server                    # :4000
npm run dev:web                       # :3000 (set NEXT_PUBLIC_API_BASE if the API is elsewhere)
```

Without `DATABASE_URL` the server uses in-memory storage and warns. Binance market data is public, so live mode needs no exchange key. If Binance is unreachable (network policy, or HTTP 451 from a restricted location), the UI shows the error and no prices.

### Offline UI development (fixture replay)

```bash
DATA_MODE=fixture FIXTURE_SPEED=10 npm run dev:server
```

This replays `fixtures/synthetic` on a virtual clock through the same Binance parsers as live mode, starting from the fixture's replay start. The UI shows a permanent **DEMO REPLAY — not live** banner, and every record is stored with `data_origin='fixture'`. The synthetic fixtures (`scripts/generate-synthetic-fixtures.ts`) are a seeded random walk in Binance response format, with an illustrative contract spec. They are **neither market data nor Binance's real XAUUSDT specification**.

To replay real data, record it (`npm run fixtures:record -- --minutes=20`) and point `FIXTURE_DIR` at `fixtures/recorded/<timestamp>`. Recordings are git-ignored; check Binance's terms before sharing them.

## Testing

```bash
npm run typecheck                      # core, server, web
npm test                               # unit tests (core + server)
DATABASE_URL=postgres://… npm run test:integration   # adapter/engine/API + PostgreSQL
npm run connectivity                   # REAL Binance check: every REST endpoint, contract validation, each stream; Anthropic model
```

The integration tests drive the real `BinanceFuturesAdapter` and engine against a mock REST endpoint and a local WebSocket server. The REST mock serves Binance-format bodies *as of a virtual clock*, so no future bars are visible, and it sends `X-MBX-USED-WEIGHT-1M`. The WebSocket server speaks the combined-stream protocol on `/market/stream` and `/public/stream`. The tests cover:

- contract validation, and refusing to run when XAUUSDT is missing even if PAXGUSDT or XAUTUSDT exist
- exchange status changes
- history and initial sync, and the exact stream subscriptions
- trades, book, mark, ticker and klines flowing through to the price view, snapshot and alerts
- final-kline confirmation with REST agreement and no duplicate alerts, and native 1h cross-checks
- reconnect plus REST resync, and the silence watchdog
- 429 with `Retry-After`, and 418 bans
- the full HTTP/SSE API, and the PostgreSQL repository (skipped when `DATABASE_URL` is unset)

Claude is replaced by a stand-in that answers using only references present in the snapshot it receives.

## Binance notes

- Request weight is plentiful for this app (about 10–20 per minute in steady state against a 2,400/min limit), so 1m confirmation runs every minute.
- Some regions cannot reach Binance Futures (HTTP 451). Run the server where it can.
- If book streams stay silent on `BINANCE_WS_BOOK_URL`, the UI flags them stale. `npm run connectivity` reports which streams deliver on which URL; set the book URL to the market URL if your routing differs.
- Funding interval: taken from `/fapi/v1/fundingInfo` when Binance lists the symbol there, otherwise inferred from the spacing of recent funding events (labelled "from history").

## API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | mode, database, feed, analyst and admin-auth status |
| GET | `/api/auth/check` 🔒 | validates the admin token |
| GET | `/api/state` | price view, engine status, analyst budget |
| GET | `/api/candles?tf=1h&limit=500` | closed candles, forming bar, EMA series, swings, events, levels |
| GET | `/api/trend` | all timeframe trend readings |
| GET | `/api/market` | contract, top of book, depth, mark/index/basis, funding, 24h ticker, open interest, constituents, index regime, stream health |
| GET | `/api/contract` | validated XAUUSDT contract spec from exchangeInfo |
| GET | `/api/snapshot` | current analyst input snapshot |
| POST | `/api/analysis/refresh` 🔒 | manual Claude analysis (cooldown and caps apply) |
| GET | `/api/analysis` | recent analyses + budget |
| GET · POST/PUT/DELETE 🔒 | `/api/alerts/rules[/:id]` | alert rules |
| GET · POST 🔒 | `/api/alerts/events` · `/api/alerts/events/:id/ack` | alert feed, acknowledge |
| GET | `/api/history[/:id]` | alerts with outcomes; detail includes the input snapshot |
| GET | `/api/snapshots/:id` | stored snapshot |
| GET | `/api/stream` | SSE: `price`, `market` (1/s), `status`, `close`, `alert`, `analysis`, `gap` |

🔒 = requires the admin bearer token.

### Authentication

Every state-changing endpoint (all `POST`/`PUT`/`DELETE` routes) requires `Authorization: Bearer <ADMIN_API_TOKEN>`:

- **Fails closed.** With no `ADMIN_API_TOKEN` set, those endpoints return `503 admin_token_not_configured`. A missing or wrong token gets `401`.
- **No leak.** Tokens are compared as SHA-256 digests in constant time, and the configured token must be at least 32 characters.
- **Can't be forgotten.** The server refuses to start if a non-GET route is registered without the guard.
- **Read endpoints stay public:** prices, candles, trends, market state, analyses, history and the SSE stream. Treat the API as public read-only market data.
- **In the UI,** click **Unlock admin** in the top bar and paste the token. It is checked against `GET /api/auth/check`, then kept only in that browser's `localStorage` (never in the build). **Lock** forgets it. A token the server rejects, for example after rotation, is dropped automatically.

```bash
openssl rand -hex 32   # put the result in ADMIN_API_TOKEN
curl -X POST http://localhost:4000/api/analysis/refresh -H "Authorization: Bearer $ADMIN_API_TOKEN"
```

This is a single shared operator token, not per-user accounts. Over plain HTTP the token travels in clear text, so serve the API over HTTPS (e.g. behind a TLS reverse proxy) anywhere beyond localhost. The server-side cost caps bound Claude spend regardless.
