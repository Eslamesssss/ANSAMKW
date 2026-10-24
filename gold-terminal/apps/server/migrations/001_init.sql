-- GOLD INTELLIGENCE TERMINAL V1 — initial schema. All timestamps are UTC (timestamptz).

CREATE TABLE IF NOT EXISTS candles (
  symbol        text        NOT NULL,
  timeframe     text        NOT NULL,
  open_time     timestamptz NOT NULL,
  open          numeric(14,5) NOT NULL,
  high          numeric(14,5) NOT NULL,
  low           numeric(14,5) NOT NULL,
  close         numeric(14,5) NOT NULL,
  -- NULL when the provider does not report volume; never synthesised.
  volume        numeric(20,4),
  -- 'confirmed' = provider REST closed bar, 'derived' = aggregated from confirmed 1m bars.
  status        text        NOT NULL CHECK (status IN ('confirmed', 'derived')),
  source        text        NOT NULL,
  data_origin   text        NOT NULL CHECK (data_origin IN ('live', 'fixture')),
  revision      integer     NOT NULL DEFAULT 1,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (data_origin, symbol, timeframe, open_time)
);

-- Audit trail of corrections made during reconciliation against the provider.
CREATE TABLE IF NOT EXISTS candle_revisions (
  id            bigserial   PRIMARY KEY,
  symbol        text        NOT NULL,
  timeframe     text        NOT NULL,
  open_time     timestamptz NOT NULL,
  data_origin   text        NOT NULL,
  kind          text        NOT NULL,
  previous      jsonb,
  current       jsonb,
  max_abs_delta double precision,
  detected_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS candle_revisions_time_idx ON candle_revisions (timeframe, open_time);

CREATE TABLE IF NOT EXISTS data_gaps (
  id            bigserial   PRIMARY KEY,
  symbol        text        NOT NULL,
  timeframe     text        NOT NULL,
  data_origin   text        NOT NULL,
  gap_from      timestamptz NOT NULL,
  gap_to        timestamptz NOT NULL,
  detected_at   timestamptz NOT NULL DEFAULT now(),
  resolved_at   timestamptz,
  UNIQUE (data_origin, symbol, timeframe, gap_from)
);

CREATE TABLE IF NOT EXISTS feed_events (
  id            bigserial   PRIMARY KEY,
  occurred_at   timestamptz NOT NULL DEFAULT now(),
  source        text        NOT NULL,
  kind          text        NOT NULL,
  detail        jsonb
);
CREATE INDEX IF NOT EXISTS feed_events_time_idx ON feed_events (occurred_at DESC);

-- Exact structured inputs referenced by alerts and AI analyses.
CREATE TABLE IF NOT EXISTS market_snapshots (
  id            uuid        PRIMARY KEY,
  created_at    timestamptz NOT NULL DEFAULT now(),
  symbol        text        NOT NULL,
  data_origin   text        NOT NULL,
  trigger_kind  text        NOT NULL,
  payload       jsonb       NOT NULL,
  payload_sha256 text       NOT NULL
);
CREATE INDEX IF NOT EXISTS market_snapshots_time_idx ON market_snapshots (created_at DESC);

CREATE TABLE IF NOT EXISTS alert_rules (
  id            text        PRIMARY KEY,
  rule          jsonb       NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS alert_events (
  id              uuid        PRIMARY KEY,
  rule_id         text        NOT NULL,
  rule_type       text        NOT NULL,
  dedupe_key      text        NOT NULL,
  symbol          text        NOT NULL,
  timeframe       text        NOT NULL,
  candle_open_time timestamptz NOT NULL,
  triggered_at    timestamptz NOT NULL,
  price           numeric(14,5) NOT NULL,
  title           text        NOT NULL,
  detail          jsonb       NOT NULL,
  snapshot_id     uuid        REFERENCES market_snapshots(id),
  data_origin     text        NOT NULL,
  acknowledged_at timestamptz,
  UNIQUE (data_origin, dedupe_key)
);
CREATE INDEX IF NOT EXISTS alert_events_time_idx ON alert_events (triggered_at DESC);

CREATE TABLE IF NOT EXISTS alert_outcomes (
  alert_id        uuid        NOT NULL REFERENCES alert_events(id) ON DELETE CASCADE,
  horizon_min     integer     NOT NULL,
  status          text        NOT NULL,
  close_at_horizon numeric(14,5),
  max_high        numeric(14,5),
  min_low         numeric(14,5),
  change_abs      numeric(14,5),
  bars_seen       integer     NOT NULL DEFAULT 0,
  evaluated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (alert_id, horizon_min)
);

CREATE TABLE IF NOT EXISTS analyses (
  id              uuid        PRIMARY KEY,
  created_at      timestamptz NOT NULL DEFAULT now(),
  snapshot_id     uuid        REFERENCES market_snapshots(id),
  trigger_kind    text        NOT NULL,
  trigger_detail  jsonb,
  -- ok | rejected_validation | skipped | error | refused
  status          text        NOT NULL,
  model           text,
  served_model    text,
  input_tokens    integer,
  output_tokens   integer,
  cost_usd        numeric(10,5),
  output          jsonb,
  errors          jsonb,
  data_origin     text        NOT NULL
);
CREATE INDEX IF NOT EXISTS analyses_time_idx ON analyses (created_at DESC);
