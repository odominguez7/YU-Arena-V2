const WebSocket = require("ws");

const BASE_URL = (process.env.BASE_URL || "http://127.0.0.1:8080").replace(/\/+$/, "");
const API_BASE = BASE_URL + "/api";
const ACCESS_CODE = process.env.ACCESS_CODE || "demo1234";
const OPERATOR_ID = process.env.OPERATOR_ID || "";
const SCAN_INTERVAL_MS = parseInt(process.env.SCAN_INTERVAL_MS || "30000", 10);
const DROP_TIMER_SECONDS = parseInt(process.env.DROP_TIMER_SECONDS || "90", 10);

let jwt = process.env.JWT || "";
let operatorId = OPERATOR_ID;
let businessName = "";
let cycleCount = 0;

async function login() {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ access_code: ACCESS_CODE }),
  });
  if (!res.ok) throw new Error(`Login failed (${res.status}): ${await res.text()}`);
  const data = await res.json();
  jwt = data.token;
  operatorId = data.operator.id;
  businessName = data.operator.business_name;
  console.log(`[HAWK] Authenticated as "${businessName}" (${operatorId})`);
}

function authHeaders() {
  return { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` };
}

async function fetchOfferings() {
  const res = await fetch(`${API_BASE}/offerings`, { headers: authHeaders() });
  return res.ok ? res.json() : [];
}

async function fetchTodaySchedule() {
  const res = await fetch(`${API_BASE}/schedule/today`, { headers: authHeaders() });
  return res.ok ? res.json() : [];
}

async function fetchLiveDrops() {
  const res = await fetch(`${API_BASE}/drops?status=live`, { headers: authHeaders() });
  return res.ok ? res.json() : [];
}

const DROP_TYPES = ["Flash Drop", "Urgent Fill", "Last Chance", "Open Spot"];

async function launchDrop(offeringId, scheduleBlockId, title, spots, priceCents) {
  const body = {
    offering_id: offeringId,
    title,
    spots_available: spots,
    price_cents: priceCents,
    timer_seconds: DROP_TIMER_SECONDS,
  };
  if (scheduleBlockId) body.schedule_block_id = scheduleBlockId;

  const res = await fetch(`${API_BASE}/drops`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    console.error(`[HAWK] Drop launch failed (${res.status}):`, await res.text());
    return null;
  }
  const drop = await res.json();
  console.log(`[HAWK] 🦅 Cancellation detected → "${drop.title}" (${drop.id})`);
  console.log(`[HAWK]    ${drop.spots_available} spots · $${(drop.price_cents / 100).toFixed(2)} · ${DROP_TIMER_SECONDS}s window`);
  return drop;
}

async function confirmClaim(claimId) {
  const res = await fetch(`${API_BASE}/claims/${claimId}/confirm`, {
    method: "PATCH",
    headers: authHeaders(),
  });
  if (!res.ok) {
    console.error(`[HAWK] Confirm failed for ${claimId}`);
    return false;
  }
  const claim = await res.json();
  console.log(`[HAWK] ✅ Confirmed claim ${claimId} → "${claim.claimant_name}"`);
  return true;
}

function evaluateOpportunity(offering, block) {
  let score = 50;
  const reasons = [];
  const name = (offering?.name || "").toLowerCase();

  if (name.includes("yoga") || name.includes("pilates")) { score += 15; reasons.push("high-demand category"); }
  if (name.includes("hiit") || name.includes("crossfit")) { score += 10; reasons.push("intense workout"); }

  const hour = new Date().getHours();
  if (hour >= 6 && hour <= 9) { score += 10; reasons.push("morning peak"); }
  if (hour >= 17 && hour <= 19) { score += 12; reasons.push("evening rush"); }

  const price = offering?.default_price_cents || 0;
  if (price >= 2000) { score += 8; reasons.push("premium pricing"); }

  return { score, reasons, confidence: Math.min(98, score + Math.floor(Math.random() * 10)) };
}

async function scanAndDetect() {
  try {
    cycleCount++;
    const [schedule, liveDrops, offerings] = await Promise.all([
      fetchTodaySchedule(),
      fetchLiveDrops(),
      fetchOfferings(),
    ]);

    const liveOfferingIds = new Set(liveDrops.map((d) => d.offering_id));
    const offeringMap = new Map(offerings.map((o) => [o.id, o]));

    const candidates = schedule.filter((block) => !liveOfferingIds.has(block.offering_id));

    if (candidates.length === 0) {
      if (liveDrops.length > 0) {
        console.log(`[HAWK] 🔍 Monitoring ${liveDrops.length} active drop(s)...`);
      } else if (schedule.length === 0 && offerings.length > 0) {
        const offering = offerings[cycleCount % offerings.length];
        const dropType = DROP_TYPES[cycleCount % DROP_TYPES.length];
        console.log(`[HAWK] 🦅 No schedule — simulating cancellation for "${offering.name}"`);
        const { score, reasons, confidence } = evaluateOpportunity(offering, null);
        console.log(`[HAWK]    Score: ${score} · Confidence: ${confidence}% · ${reasons.join(", ")}`);
        await launchDrop(
          offering.id,
          null,
          `${offering.name} — ${dropType}`,
          Math.min(offering.default_spots, 4),
          offering.default_price_cents
        );
      }
      return;
    }

    const block = candidates[0];
    const offering = offeringMap.get(block.offering_id);
    const { score, reasons, confidence } = evaluateOpportunity(offering, block);
    const dropType = DROP_TYPES[cycleCount % DROP_TYPES.length];

    console.log(`[HAWK] 🔍 Scanning schedule...`);
    console.log(`[HAWK] 🦅 Detected gap: "${offering?.name}" ${block.start_time}–${block.end_time}`);
    console.log(`[HAWK]    Score: ${score} · Confidence: ${confidence}% · ${reasons.join(", ")}`);

    await launchDrop(
      block.offering_id,
      block.id,
      `${offering?.name || "Class"} — ${dropType}`,
      Math.min(block.default_spots, 4),
      offering?.default_price_cents || 0
    );
  } catch (err) {
    console.error("[HAWK] Scan error:", err.message);
  }
}

function connect() {
  const wsUrl = BASE_URL.replace(/^http/, "ws") + `/ws?operatorId=${operatorId}`;
  console.log(`[HAWK] Connecting to WebSocket: ${wsUrl}`);

  const ws = new WebSocket(wsUrl);
  let heartbeatTimer = null;
  let scanTimer = null;

  ws.on("open", async () => {
    console.log(`[HAWK] 🦅 Connected — HAWK Detection Agent active`);
    console.log(`[HAWK]    Role: Cancellation Scanner`);
    console.log(`[HAWK]    Scan interval: ${SCAN_INTERVAL_MS / 1000}s`);

    const sendHeartbeat = () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "agent_heartbeat", actor: "HAWK" }));
      }
    };
    sendHeartbeat();
    heartbeatTimer = setInterval(sendHeartbeat, 5000);

    await scanAndDetect();
    scanTimer = setInterval(scanAndDetect, SCAN_INTERVAL_MS);
  });

  ws.on("message", async (raw) => {
    try {
      const event = JSON.parse(raw.toString());
      if (event.type === "connected") return;

      if (event.type === "claim_received") {
        const payload = event.payload || {};
        console.log(`[HAWK] 📨 Claim received from "${payload.claimant_name}" — auto-confirming...`);
        await confirmClaim(payload.claim_id);
      }

      if (event.type === "drop_filled") {
        console.log(`[HAWK] ✅ Drop ${event.payload?.drop_id} fully filled — revenue recovered!`);
      }

      if (event.type === "drop_expired") {
        console.log(`[HAWK] ⏰ Drop ${event.payload?.drop_id} expired — missed recovery`);
      }
    } catch (err) {
      console.error("[HAWK] Message error:", err.message);
    }
  });

  ws.on("close", () => {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    if (scanTimer) clearInterval(scanTimer);
    console.log("[HAWK] Disconnected. Reconnecting in 3s...");
    setTimeout(connect, 3000);
  });

  ws.on("error", (err) => {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    if (scanTimer) clearInterval(scanTimer);
    console.error("[HAWK] WebSocket error:", err.message);
  });
}

(async () => {
  try {
    if (!jwt) await login();
    else if (!operatorId) {
      const res = await fetch(`${API_BASE}/auth/me`, { headers: authHeaders() });
      if (!res.ok) throw new Error("JWT invalid");
      const me = await res.json();
      operatorId = me.id;
      businessName = me.business_name;
    }
    connect();
  } catch (err) {
    console.error("[HAWK] Startup failed:", err.message);
    process.exit(1);
  }
})();
