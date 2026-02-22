import crypto from "crypto";
import { Pool, PoolClient, QueryResult, QueryResultRow } from "pg";
import { v4 as uuid } from "uuid";

function hashKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

const dbHost = process.env.DB_HOST || "127.0.0.1";
const isUnixSocket = dbHost.startsWith("/");

const pool = new Pool({
  host: isUnixSocket ? dbHost : dbHost,
  port: isUnixSocket ? undefined : parseInt(process.env.DB_PORT || "5432", 10),
  database: process.env.DB_NAME || "yu_arena",
  user: process.env.DB_USER || "yu_app",
  password: process.env.DB_PASSWORD || "",
  max: parseInt(process.env.DB_POOL_MAX || "10", 10),
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : undefined,
});

async function setupSchema(): Promise<void> {
  await pool.query(`
    -- Legacy tables (kept for backward compatibility)
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

    -- Operator-centric tables (YU Arena v2)
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

    CREATE INDEX IF NOT EXISTS idx_offerings_operator ON offerings(operator_id);
    CREATE INDEX IF NOT EXISTS idx_schedule_blocks_operator ON schedule_blocks(operator_id);
    CREATE INDEX IF NOT EXISTS idx_schedule_blocks_day ON schedule_blocks(operator_id, day_of_week);
    CREATE INDEX IF NOT EXISTS idx_rush_list_operator ON rush_list_members(operator_id);
    CREATE INDEX IF NOT EXISTS idx_drops_operator ON drops(operator_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_drops_status ON drops(status, expires_at);
    CREATE INDEX IF NOT EXISTS idx_claims_drop ON claims(drop_id);
    CREATE INDEX IF NOT EXISTS idx_operator_events_operator ON operator_events(operator_id, created_at DESC);
  `);
}

const SCOUT_KEY = process.env.SCOUT_API_KEY || "yu-scout-key-demo";
const CLOSER_KEY = process.env.CLOSER_API_KEY || "yu-closer-key-demo";
const DEMO_ACCESS_CODE = process.env.DEMO_ACCESS_CODE || "demo1234";

async function seedAgents(): Promise<void> {
  const upsertAgent = `
    INSERT INTO agents (id, name, api_key_hash) VALUES ($1, $2, $3)
    ON CONFLICT(name) DO UPDATE SET api_key_hash = EXCLUDED.api_key_hash
  `;
  await pool.query(upsertAgent, [uuid(), "Scout", hashKey(SCOUT_KEY)]);
  await pool.query(upsertAgent, [uuid(), "Closer", hashKey(CLOSER_KEY)]);
}

async function seedDemoOperator(): Promise<void> {
  const operatorId = "demo-operator-001";
  const existing = await pool.query(
    `SELECT id FROM operators WHERE id = $1`,
    [operatorId]
  );
  if (existing.rows.length > 0) return;

  const accessCodeHash = hashKey(DEMO_ACCESS_CODE);

  await pool.query(
    `INSERT INTO operators (id, business_name, access_code_hash, phone)
     VALUES ($1, $2, $3, $4)`,
    [operatorId, "Iron Forge Fitness", accessCodeHash, "+16175551234"]
  );

  const offeringIds = {
    crossfit: uuid(),
    yoga: uuid(),
    hiit: uuid(),
  };

  const offerings = [
    [offeringIds.crossfit, operatorId, "CrossFit WOD", 2500, 12],
    [offeringIds.yoga, operatorId, "Vinyasa Yoga", 1800, 15],
    [offeringIds.hiit, operatorId, "HIIT Express", 2000, 10],
  ];
  for (const [id, opId, name, price, spots] of offerings) {
    await pool.query(
      `INSERT INTO offerings (id, operator_id, name, default_price_cents, default_spots)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, opId, name, price, spots]
    );
  }

  // Weekly schedule: Mon-Sat classes
  const scheduleData: [string, string, number, string, string, number][] = [
    [offeringIds.crossfit, operatorId, 1, "06:00", "07:00", 12],
    [offeringIds.crossfit, operatorId, 1, "17:00", "18:00", 12],
    [offeringIds.yoga, operatorId, 2, "09:00", "10:00", 15],
    [offeringIds.yoga, operatorId, 4, "18:00", "19:00", 15],
    [offeringIds.hiit, operatorId, 3, "12:00", "12:45", 10],
    [offeringIds.hiit, operatorId, 5, "07:00", "07:45", 10],
    [offeringIds.crossfit, operatorId, 6, "09:00", "10:00", 12],
  ];
  for (const [offId, opId, dow, start, end, spots] of scheduleData) {
    await pool.query(
      `INSERT INTO schedule_blocks (id, operator_id, offering_id, day_of_week, start_time, end_time, default_spots)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [uuid(), opId, offId, dow, start, end, spots]
    );
  }

  // Seed a few rush list members
  const members = [
    ["+16175559001", "Alex Rivera"],
    ["+16175559002", "Jordan Chen"],
    ["+16175559003", "Sam Patel"],
    ["+16175559004", "Casey Kim"],
    ["+16175559005", "Morgan Lee"],
  ];
  for (const [phone, name] of members) {
    await pool.query(
      `INSERT INTO rush_list_members (id, operator_id, phone, name)
       VALUES ($1, $2, $3, $4)`,
      [uuid(), operatorId, phone, name]
    );
  }

  console.log(`Seeded demo operator "${operatorId}" (access code: ${DEMO_ACCESS_CODE})`);
}

async function cleanupIdempotencyKeys(): Promise<void> {
  await pool.query(
    `DELETE FROM idempotency_keys WHERE created_at < NOW() - INTERVAL '1 hour'`
  );
}

async function initDb(): Promise<void> {
  await setupSchema();
  await seedAgents();
  await seedDemoOperator();
  setInterval(() => {
    cleanupIdempotencyKeys().catch((err) => {
      console.error("Failed to cleanup idempotency keys:", err);
    });
  }, 60_000);
}

async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = []
): Promise<QueryResult<T>> {
  return pool.query<T>(text, params);
}

async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export { pool, query, withTransaction, initDb, hashKey };
