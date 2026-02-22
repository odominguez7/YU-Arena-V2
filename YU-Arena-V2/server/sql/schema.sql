-- ═══════════════════════════════════════════════════════════
-- Legacy tables (retained for backward compatibility)
-- Will be removed once all routes are migrated to operator model
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS rooms (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agents (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL UNIQUE,
  api_key_hash TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS opportunities (
  id          TEXT PRIMARY KEY,
  room_id     TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'claimed', 'resolved')),
  created_by  TEXT NOT NULL,
  claimed_by  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS events (
  id          TEXT PRIMARY KEY,
  room_id     TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  actor       TEXT NOT NULL,
  payload     TEXT NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  key         TEXT PRIMARY KEY,
  response    TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_room ON events(room_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_opportunities_room ON opportunities(room_id);
CREATE INDEX IF NOT EXISTS idx_idempotency_expiry ON idempotency_keys(created_at);

-- ═══════════════════════════════════════════════════════════
-- Operator-centric tables (YU Arena v2)
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS operators (
  id                   TEXT PRIMARY KEY,
  business_name        TEXT NOT NULL,
  access_code_hash     TEXT NOT NULL,
  phone                TEXT,
  whatsapp_from_number TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS offerings (
  id                  TEXT PRIMARY KEY,
  operator_id         TEXT NOT NULL REFERENCES operators(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  default_price_cents INTEGER NOT NULL DEFAULT 0,
  default_spots       INTEGER NOT NULL DEFAULT 1,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS schedule_blocks (
  id            TEXT PRIMARY KEY,
  operator_id   TEXT NOT NULL REFERENCES operators(id) ON DELETE CASCADE,
  offering_id   TEXT NOT NULL REFERENCES offerings(id) ON DELETE CASCADE,
  day_of_week   INTEGER NOT NULL CHECK(day_of_week >= 0 AND day_of_week <= 6),
  start_time    TIME NOT NULL,
  end_time      TIME NOT NULL,
  default_spots INTEGER NOT NULL DEFAULT 1,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rush_list_members (
  id          TEXT PRIMARY KEY,
  operator_id TEXT NOT NULL REFERENCES operators(id) ON DELETE CASCADE,
  phone       TEXT NOT NULL,
  name        TEXT NOT NULL,
  opted_in_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(operator_id, phone)
);

CREATE TABLE IF NOT EXISTS drops (
  id                TEXT PRIMARY KEY,
  operator_id       TEXT NOT NULL REFERENCES operators(id) ON DELETE CASCADE,
  offering_id       TEXT NOT NULL REFERENCES offerings(id) ON DELETE CASCADE,
  schedule_block_id TEXT REFERENCES schedule_blocks(id) ON DELETE SET NULL,
  title             TEXT NOT NULL,
  spots_available   INTEGER NOT NULL DEFAULT 1,
  price_cents       INTEGER NOT NULL DEFAULT 0,
  timer_seconds     INTEGER NOT NULL DEFAULT 90,
  status            TEXT NOT NULL DEFAULT 'live'
                    CHECK(status IN ('live', 'filled', 'expired', 'cancelled')),
  launched_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at        TIMESTAMPTZ NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS claims (
  id             TEXT PRIMARY KEY,
  drop_id        TEXT NOT NULL REFERENCES drops(id) ON DELETE CASCADE,
  claimant_phone TEXT NOT NULL,
  claimant_name  TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'pending'
                 CHECK(status IN ('pending', 'confirmed', 'rejected', 'expired')),
  claimed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at   TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS operator_events (
  id          TEXT PRIMARY KEY,
  operator_id TEXT NOT NULL REFERENCES operators(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  actor       TEXT NOT NULL,
  payload     JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for new tables
CREATE INDEX IF NOT EXISTS idx_offerings_operator ON offerings(operator_id);
CREATE INDEX IF NOT EXISTS idx_schedule_blocks_operator ON schedule_blocks(operator_id);
CREATE INDEX IF NOT EXISTS idx_schedule_blocks_day ON schedule_blocks(operator_id, day_of_week);
CREATE INDEX IF NOT EXISTS idx_rush_list_operator ON rush_list_members(operator_id);
CREATE INDEX IF NOT EXISTS idx_drops_operator ON drops(operator_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_drops_status ON drops(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_claims_drop ON claims(drop_id);
CREATE INDEX IF NOT EXISTS idx_operator_events_operator ON operator_events(operator_id, created_at DESC);
