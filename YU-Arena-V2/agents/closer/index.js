const WebSocket = require("ws");

const BASE_URL = (process.env.BASE_URL || "http://127.0.0.1:8080").replace(/\/+$/, "");
const API_BASE = BASE_URL + "/api";
const ACCESS_CODE = process.env.ACCESS_CODE || "demo1234";
const OPERATOR_ID = process.env.OPERATOR_ID || "";
const CLAIM_DELAY_MS = parseInt(process.env.CLAIM_DELAY_MS || "2000", 10);

let jwt = process.env.JWT || "";
let operatorId = OPERATOR_ID;
let claimantPool = [];

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
  console.log(`[Closer] Logged in as "${data.operator.business_name}" (${operatorId})`);
}

function authHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${jwt}`,
  };
}

async function fetchRushList() {
  try {
    const res = await fetch(`${API_BASE}/rush-list`, { headers: authHeaders() });
    if (!res.ok) {
      console.warn(`[Closer] Rush list fetch failed (${res.status}) — check JWT/ACCESS_CODE`);
      return [];
    }
    const list = await res.json();
    if (!Array.isArray(list)) return [];
    return list.map((m) => ({ phone: String(m.phone || "").trim(), name: String(m.name || "Member").trim() })).filter((m) => m.phone);
  } catch (err) {
    console.error("[Closer] Rush list fetch error:", err.message);
    return [];
  }
}

const claimedDrops = new Set();
let claimantIndex = 0;

function nextClaimant() {
  if (claimantPool.length === 0) return null;
  const claimant = claimantPool[claimantIndex % claimantPool.length];
  claimantIndex++;
  return claimant;
}

function evaluateDrop(payload) {
  const title = String(payload.title || "").toLowerCase();
  const spots = payload.spots_available || 1;
  const priceCents = payload.price_cents || 0;
  let score = 50;
  const reasons = [];

  if (spots >= 5) { score += 15; reasons.push("high availability"); }
  if (priceCents > 0 && priceCents <= 3000) { score += 10; reasons.push("affordable"); }
  if (title.includes("open") || title.includes("spot")) { score += 10; reasons.push("capacity keywords"); }
  if (title.includes("express") || title.includes("hiit")) { score += 5; reasons.push("high-energy class"); }

  const decision = score >= 60 ? "CLAIM" : "SKIP";
  return { decision, score, reasons };
}

async function claimDrop(dropId, claimantPhone, claimantName) {
  const res = await fetch(`${API_BASE}/drops/${dropId}/claim`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ claimant_phone: claimantPhone, claimant_name: claimantName }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error(`[Closer] Claim failed for drop ${dropId} (${res.status}):`, err);
    return null;
  }
  return res.json();
}

function connect() {
  const wsUrl = BASE_URL.replace(/^http/, "ws") + `/ws?operatorId=${operatorId}`;
  console.log(`[Closer] Connecting to WebSocket: ${wsUrl}`);

  const ws = new WebSocket(wsUrl);
  let heartbeatTimer = null;

  ws.on("open", async () => {
    console.log(`[Closer] Connected — watching operator ${operatorId}`);
    claimantPool = await fetchRushList();
    console.log(`[Closer] Rush list: ${claimantPool.length} members`);

    const sendHeartbeat = () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "agent_heartbeat", actor: "Closer" }));
      }
    };
    sendHeartbeat();
    heartbeatTimer = setInterval(sendHeartbeat, 5000);
  });

  ws.on("message", async (raw) => {
    try {
      const event = JSON.parse(raw.toString());
      if (event.type === "connected") return;

      if (event.type === "drop_launched") {
        const payload = event.payload || {};
        const dropId = payload.drop_id;
        if (!dropId || claimedDrops.has(dropId)) return;

        const { decision, score, reasons } = evaluateDrop(payload);
        console.log(`[Closer] Drop "${payload.title}" — ${decision} (score=${score}, ${reasons.join(", ")})`);

        if (decision !== "CLAIM") return;

        claimantPool = await fetchRushList();
        if (claimantPool.length === 0) {
          console.log(`[Closer] Skipping — no rush list members. Add members in Settings.`);
          return;
        }

        claimedDrops.add(dropId);
        const spotsToFill = Math.min(payload.spots_available || 1, claimantPool.length);

        for (let i = 0; i < spotsToFill; i++) {
          await new Promise((r) => setTimeout(r, CLAIM_DELAY_MS));
          const claimant = nextClaimant();
          if (!claimant) break;
          const { phone, name } = claimant;
          console.log(`[Closer] Claiming drop "${payload.title}" as ${name} (${phone})...`);
          const claim = await claimDrop(dropId, phone, name);
          if (claim) {
            console.log(`[Closer] Claim submitted: ${claim.id} (status: ${claim.status})`);
          } else {
            console.warn(`[Closer] Claim failed — ${name} may not be on rush list`);
          }
        }
      }

      if (event.type === "claim_confirmed") {
        const payload = event.payload || {};
        console.log(`[Closer] Claim ${payload.claim_id} confirmed for "${payload.claimant_name}"`);
      }

      if (event.type === "drop_filled") {
        const payload = event.payload || {};
        console.log(`[Closer] Drop ${payload.drop_id} is fully filled!`);
      }

      if (event.type === "drop_expired") {
        const payload = event.payload || {};
        console.log(`[Closer] Drop ${payload.drop_id} expired.`);
        claimedDrops.delete(payload.drop_id);
      }
    } catch (err) {
      console.error("[Closer] Error processing message:", err.message);
    }
  });

  ws.on("close", () => {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    console.log("[Closer] Disconnected. Reconnecting in 3s...");
    setTimeout(connect, 3000);
  });

  ws.on("error", (err) => {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    console.error("[Closer] WebSocket error:", err.message);
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
      console.log(`[Closer] Authenticated as "${me.business_name}" (${operatorId})`);
    }
    connect();
  } catch (err) {
    console.error("[Closer] Startup failed:", err.message);
    process.exit(1);
  }
})();
