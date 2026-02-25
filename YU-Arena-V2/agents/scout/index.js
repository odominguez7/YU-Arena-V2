const WebSocket = require("ws");

const BASE_URL = (process.env.BASE_URL || "http://127.0.0.1:8080").replace(/\/+$/, "");
const API_BASE = BASE_URL + "/api";
const ACCESS_CODE = process.env.ACCESS_CODE || "demo1234";
const OPERATOR_ID = process.env.OPERATOR_ID || "";
const DROP_INTERVAL_MS = parseInt(process.env.DROP_INTERVAL_MS || "30000", 10);
const DROP_TIMER_SECONDS = parseInt(process.env.DROP_TIMER_SECONDS || "90", 10);

let jwt = process.env.JWT || "";
let operatorId = OPERATOR_ID;
let businessName = "";

async function login() {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ access_code: ACCESS_CODE }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Login failed (${res.status}): ${body}`);
  }
  const data = await res.json();
  jwt = data.token;
  operatorId = data.operator.id;
  businessName = data.operator.business_name;
  console.log(`[Scout] Logged in as "${businessName}" (${operatorId})`);
}

function authHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${jwt}`,
  };
}

async function fetchOfferings() {
  const res = await fetch(`${API_BASE}/offerings`, { headers: authHeaders() });
  if (!res.ok) return [];
  return res.json();
}

async function fetchTodaySchedule() {
  const res = await fetch(`${API_BASE}/schedule/today`, { headers: authHeaders() });
  if (!res.ok) return [];
  return res.json();
}

async function fetchLiveDrops() {
  const res = await fetch(`${API_BASE}/drops?status=live`, { headers: authHeaders() });
  if (!res.ok) return [];
  return res.json();
}

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
    const err = await res.text();
    console.error(`[Scout] Failed to launch drop (${res.status}):`, err);
    return null;
  }
  const drop = await res.json();
  console.log(`[Scout] Launched drop "${drop.title}" (${drop.id}) — ${drop.spots_available} spots, $${(drop.price_cents / 100).toFixed(2)}, ${drop.timer_seconds}s timer`);
  return drop;
}

async function confirmClaim(claimId) {
  const res = await fetch(`${API_BASE}/claims/${claimId}/confirm`, {
    method: "PATCH",
    headers: authHeaders(),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error(`[Scout] Failed to confirm claim ${claimId} (${res.status}):`, err);
    return false;
  }
  const claim = await res.json();
  console.log(`[Scout] Confirmed claim ${claimId} for "${claim.claimant_name}"`);
  return true;
}

async function scanAndLaunchDrops() {
  try {
    const [schedule, liveDrops, offerings] = await Promise.all([
      fetchTodaySchedule(),
      fetchLiveDrops(),
      fetchOfferings(),
    ]);

    const liveOfferingIds = new Set(liveDrops.map((d) => d.offering_id));
    const offeringMap = new Map(offerings.map((o) => [o.id, o]));

    const candidates = schedule.filter((block) => {
      if (liveOfferingIds.has(block.offering_id)) return false;
      return true;
    });

    if (candidates.length === 0) {
      const nextIn = (DROP_INTERVAL_MS / 1000).toFixed(0);
      if (liveDrops.length > 0) {
        console.log(`[Scout] ${liveDrops.length} drop(s) already live. Next scan in ${nextIn}s.`);
      } else if (schedule.length === 0) {
        const offering = offerings[Math.floor(Math.random() * offerings.length)];
        if (offering) {
          console.log(`[Scout] No schedule today — launching ad-hoc drop from "${offering.name}"`);
          await launchDrop(offering.id, null, `${offering.name} — Open Spot`, offering.default_spots, offering.default_price_cents);
        } else {
          console.log(`[Scout] No offerings found. Nothing to launch.`);
        }
      } else {
        console.log(`[Scout] All scheduled blocks covered. Next scan in ${nextIn}s.`);
      }
      return;
    }

    const block = candidates[0];
    const offering = offeringMap.get(block.offering_id);
    const title = `${offering?.name || "Class"} ${block.start_time}–${block.end_time} — Open Spots`;
    await launchDrop(block.offering_id, block.id, title, block.default_spots, offering?.default_price_cents || 0);
  } catch (err) {
    console.error("[Scout] Scan error:", err.message);
  }
}

function connect() {
  const wsUrl = BASE_URL.replace(/^http/, "ws") + `/ws?operatorId=${operatorId}`;
  console.log(`[Scout] Connecting to WebSocket: ${wsUrl}`);

  const ws = new WebSocket(wsUrl);
  let heartbeatTimer = null;
  let scanTimer = null;

  ws.on("open", async () => {
    console.log(`[Scout] Connected — operator ${operatorId}`);

    const sendHeartbeat = () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "agent_heartbeat", actor: "Scout" }));
      }
    };
    sendHeartbeat();
    heartbeatTimer = setInterval(sendHeartbeat, 5000);

    await scanAndLaunchDrops();
    scanTimer = setInterval(scanAndLaunchDrops, DROP_INTERVAL_MS);
  });

  ws.on("message", async (raw) => {
    try {
      const event = JSON.parse(raw.toString());
      if (event.type === "connected") return;

      console.log(`[Scout] Event: ${event.type}`, event.payload ? JSON.stringify(event.payload) : "");

      if (event.type === "claim_received") {
        const payload = event.payload || {};
        console.log(`[Scout] Auto-confirming claim ${payload.claim_id} from "${payload.claimant_name}"...`);
        await confirmClaim(payload.claim_id);
      }
    } catch (err) {
      console.error("[Scout] Error processing message:", err.message);
    }
  });

  ws.on("close", () => {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    if (scanTimer) clearInterval(scanTimer);
    console.log("[Scout] Disconnected. Reconnecting in 3s...");
    setTimeout(connect, 3000);
  });

  ws.on("error", (err) => {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    if (scanTimer) clearInterval(scanTimer);
    console.error("[Scout] WebSocket error:", err.message);
  });
}

(async () => {
  try {
    if (!jwt) await login();
    else if (!operatorId) {
      const res = await fetch(`${API_BASE}/auth/me`, { headers: authHeaders() });
      if (!res.ok) throw new Error("JWT invalid — re-login required");
      const me = await res.json();
      operatorId = me.id;
      businessName = me.business_name;
      console.log(`[Scout] Authenticated as "${businessName}" (${operatorId})`);
    }
    connect();
  } catch (err) {
    console.error("[Scout] Startup failed:", err.message);
    process.exit(1);
  }
})();
