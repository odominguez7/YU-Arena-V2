/**
 * Smoke tests for YU Arena API.
 * Run with server already running: cd server && npm test
 */

const BASE = process.env.API_URL || "http://localhost:3001/api";
const ACCESS_CODE = process.env.DEMO_ACCESS_CODE || "demo1234";
const NOW = Date.now();

let passed = 0;
let failed = 0;

async function request(
  method: string,
  path: string,
  body?: unknown,
  token?: string
): Promise<{ status: number; data: unknown }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? (JSON.parse(text) as unknown) : {};
  return { status: res.status, data };
}

function assert(condition: boolean, msg: string): void {
  if (!condition) {
    console.error(`  FAIL: ${msg}`);
    failed++;
    return;
  }
  console.log(`  PASS: ${msg}`);
  passed++;
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function asNumber(value: unknown): number {
  return typeof value === "number" ? value : Number(value);
}

async function run(): Promise<void> {
  console.log("\n=== YU Arena Smoke Tests ===\n");

  // 1. Health
  const health = await request("GET", "/health");
  assert(health.status === 200, "Health check returns 200");

  // 2. Login
  const login = await request("POST", "/auth/login", { access_code: ACCESS_CODE });
  assert(login.status === 200, "Operator login returns 200");
  const loginData = asObject(login.data);
  const token = loginData.token as string;
  assert(typeof token === "string" && token.length > 20, "Login returns JWT token");

  // 3. Auth-me check
  const me = await request("GET", "/auth/me", undefined, token);
  assert(me.status === 200, "Auth me returns 200");

  // 4. Baseline stats
  const statsBeforeRes = await request("GET", "/stats/today", undefined, token);
  assert(statsBeforeRes.status === 200, "Stats today (before) returns 200");
  const statsBefore = asObject(statsBeforeRes.data);
  const dropsLaunchedBefore = asNumber(statsBefore.drops_launched);
  const claimsBefore = asNumber(statsBefore.claims_count);
  const recoveredBefore = asNumber(statsBefore.recovered_revenue_cents);

  // 5. Create offering
  const offeringRes = await request(
    "POST",
    "/offerings",
    {
      name: `Smoke Offering ${NOW}`,
      default_price_cents: 1900,
      default_spots: 2,
    },
    token
  );
  assert(offeringRes.status === 201, "Create offering returns 201");
  const offering = asObject(offeringRes.data);
  const offeringId = offering.id as string;
  assert(typeof offeringId === "string" && offeringId.length > 0, "Offering has id");

  // 6. Create schedule block
  const scheduleRes = await request(
    "POST",
    "/schedule",
    {
      offering_id: offeringId,
      day_of_week: new Date().getDay(),
      start_time: "18:00",
      end_time: "19:00",
      default_spots: 2,
    },
    token
  );
  assert(scheduleRes.status === 201, "Create schedule block returns 201");
  const schedule = asObject(scheduleRes.data);
  const scheduleId = schedule.id as string;
  assert(typeof scheduleId === "string" && scheduleId.length > 0, "Schedule block has id");

  // 7. Launch drop
  const dropRes = await request(
    "POST",
    "/drops",
    {
      offering_id: offeringId,
      schedule_block_id: scheduleId,
      title: `Smoke Drop ${NOW}`,
      spots_available: 2,
      price_cents: 1900,
      timer_seconds: 300,
    },
    token
  );
  assert(dropRes.status === 201, "Create drop returns 201");
  const drop = asObject(dropRes.data);
  const dropId = drop.id as string;
  assert(typeof dropId === "string" && dropId.length > 0, "Drop has id");

  // 8. Public claim
  const claimRes = await request("POST", `/drops/${dropId}/claim`, {
    claimant_phone: `+1555${String(NOW).slice(-7)}`,
    claimant_name: "Smoke Claimer",
  });
  assert(claimRes.status === 201, "Public claim returns 201");
  const claim = asObject(claimRes.data);
  const claimId = claim.id as string;
  assert(typeof claimId === "string" && claimId.length > 0, "Claim has id");
  assert(claim.status === "pending", "Claim starts as pending");

  // 9. Operator confirms claim
  const confirmRes = await request("PATCH", `/claims/${claimId}/confirm`, {}, token);
  assert(confirmRes.status === 200, "Confirm claim returns 200");
  const confirmed = asObject(confirmRes.data);
  assert(confirmed.status === "confirmed", "Claim is confirmed");

  // 10. Drop detail reflects claim
  const dropDetailRes = await request("GET", `/drops/${dropId}`, undefined, token);
  assert(dropDetailRes.status === 200, "Drop detail returns 200");
  const dropDetail = asObject(dropDetailRes.data);
  const claims = dropDetail.claims as unknown[];
  assert(Array.isArray(claims), "Drop detail includes claims array");
  assert(
    claims.some((c) => asObject(c).id === claimId && asObject(c).status === "confirmed"),
    "Drop detail includes confirmed claim"
  );

  // 11. Stats moved
  const statsAfterRes = await request("GET", "/stats/today", undefined, token);
  assert(statsAfterRes.status === 200, "Stats today (after) returns 200");
  const statsAfter = asObject(statsAfterRes.data);
  const dropsLaunchedAfter = asNumber(statsAfter.drops_launched);
  const claimsAfter = asNumber(statsAfter.claims_count);
  const recoveredAfter = asNumber(statsAfter.recovered_revenue_cents);

  assert(dropsLaunchedAfter >= dropsLaunchedBefore + 1, "Drops launched increased");
  assert(claimsAfter >= claimsBefore + 1, "Claims count increased");
  assert(recoveredAfter >= recoveredBefore + 1900, "Recovered revenue increased by claim value");

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
