const WebSocket = require("ws");

const BASE_URL = (process.env.BASE_URL || "http://127.0.0.1:8080").replace(/\/+$/, "");
const API_BASE = BASE_URL + "/api";
const ACCESS_CODE = process.env.ACCESS_CODE || "demo1234";
const OPERATOR_ID = process.env.OPERATOR_ID || "";
const CLAIM_DELAY_MS = parseInt(process.env.CLAIM_DELAY_MS || "3000", 10);

let jwt = process.env.JWT || "";
let operatorId = OPERATOR_ID;
let claimantPool = [];

const AGENT_STYLES = [
  { name: "ACE", emoji: "🎯", strategy: "high-value", bias: ["yoga", "pilates", "barre", "meditation"], speed: 3000 },
  { name: "BLITZ", emoji: "⚡", strategy: "speed", bias: [], speed: 1500 },
  { name: "GHOST", emoji: "👻", strategy: "premium", bias: ["premium", "vip", "express", "surge"], speed: 4000 },
];

const ACTIVE_STYLE = AGENT_STYLES[parseInt(process.env.AGENT_STYLE || "0", 10)] || AGENT_STYLES[0];

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
  console.log(`[${ACTIVE_STYLE.name}] Logged in as "${data.operator.business_name}" (${operatorId})`);
}

function authHeaders() {
  return { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` };
}

async function fetchRushList() {
  try {
    const res = await fetch(`${API_BASE}/rush-list`, { headers: authHeaders() });
    if (!res.ok) return [];
    const list = await res.json();
    return Array.isArray(list) ? list.map((m) => ({ phone: String(m.phone || "").trim(), name: String(m.name || "Member").trim() })).filter((m) => m.phone) : [];
  } catch {
    return [];
  }
}

const claimedDrops = new Set();
let claimantIndex = 0;

function nextClaimant() {
  if (claimantPool.length === 0) return null;
  const c = claimantPool[claimantIndex % claimantPool.length];
  claimantIndex++;
  return c;
}

function evaluateDrop(payload) {
  const title = String(payload.title || "").toLowerCase();
  const spots = payload.spots_available || 1;
  const priceCents = payload.price_cents || 0;
  let score = 50;
  const reasons = [];

  if (spots >= 3) { score += 15; reasons.push("high availability"); }
  if (priceCents > 0 && priceCents <= 4000) { score += 10; reasons.push("good value"); }

  if (ACTIVE_STYLE.bias.length > 0) {
    const matchesBias = ACTIVE_STYLE.bias.some((b) => title.includes(b));
    if (matchesBias) { score += 20; reasons.push(`${ACTIVE_STYLE.strategy} match`); }
    else { score -= 10; reasons.push("outside specialty"); }
  } else {
    score += 10;
    reasons.push("universal strategy");
  }

  if (title.includes("urgent") || title.includes("last chance")) { score += 8; reasons.push("time-sensitive"); }
  if (title.includes("flash")) { score += 5; reasons.push("flash opportunity"); }

  const decision = score >= 55 ? "CLAIM" : "SKIP";
  const confidence = Math.min(98, score + Math.floor(Math.random() * 8));
  return { decision, score, confidence, reasons };
}

async function claimDrop(dropId, phone, name) {
  const res = await fetch(`${API_BASE}/drops/${dropId}/claim`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ claimant_phone: phone, claimant_name: name }),
  });
  if (!res.ok) {
    console.error(`[${ACTIVE_STYLE.name}] Claim failed (${res.status}):`, await res.text());
    return null;
  }
  return res.json();
}

function connect() {
  const wsUrl = BASE_URL.replace(/^http/, "ws") + `/ws?operatorId=${operatorId}`;
  console.log(`[${ACTIVE_STYLE.name}] Connecting to WebSocket: ${wsUrl}`);

  const ws = new WebSocket(wsUrl);
  let heartbeatTimer = null;

  ws.on("open", async () => {
    console.log(`[${ACTIVE_STYLE.name}] ${ACTIVE_STYLE.emoji} Connected — ${ACTIVE_STYLE.strategy} conversion agent`);
    console.log(`[${ACTIVE_STYLE.name}]    Strategy: ${ACTIVE_STYLE.strategy}`);
    console.log(`[${ACTIVE_STYLE.name}]    Claim speed: ${ACTIVE_STYLE.speed}ms`);

    claimantPool = await fetchRushList();
    console.log(`[${ACTIVE_STYLE.name}] Rush list: ${claimantPool.length} customers`);

    const sendHeartbeat = () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "agent_heartbeat", actor: ACTIVE_STYLE.name }));
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

        const { decision, score, confidence, reasons } = evaluateDrop(payload);
        console.log(`[${ACTIVE_STYLE.name}] ${ACTIVE_STYLE.emoji} Evaluating "${payload.title}"`);
        console.log(`[${ACTIVE_STYLE.name}]    Decision: ${decision} · Score: ${score} · Confidence: ${confidence}%`);
        console.log(`[${ACTIVE_STYLE.name}]    Reasons: ${reasons.join(", ")}`);

        if (decision !== "CLAIM") return;

        claimantPool = await fetchRushList();
        if (claimantPool.length === 0) {
          console.log(`[${ACTIVE_STYLE.name}] No rush list customers available`);
          return;
        }

        claimedDrops.add(dropId);
        const spotsToFill = Math.min(payload.spots_available || 1, claimantPool.length);

        for (let i = 0; i < spotsToFill; i++) {
          await new Promise((r) => setTimeout(r, ACTIVE_STYLE.speed));
          const claimant = nextClaimant();
          if (!claimant) break;

          console.log(`[${ACTIVE_STYLE.name}] ${ACTIVE_STYLE.emoji} Claiming for ${claimant.name} (${claimant.phone})...`);
          const claim = await claimDrop(dropId, claimant.phone, claimant.name);
          if (claim) {
            console.log(`[${ACTIVE_STYLE.name}] ✅ Claim submitted: ${claim.id} (${claim.status})`);
          }
        }
      }

      if (event.type === "claim_confirmed") {
        console.log(`[${ACTIVE_STYLE.name}] ✅ Claim ${event.payload?.claim_id} confirmed for "${event.payload?.claimant_name}"`);
      }

      if (event.type === "drop_filled") {
        console.log(`[${ACTIVE_STYLE.name}] 🏆 Drop ${event.payload?.drop_id} fully filled — revenue recovered!`);
      }

      if (event.type === "drop_expired") {
        claimedDrops.delete(event.payload?.drop_id);
      }
    } catch (err) {
      console.error(`[${ACTIVE_STYLE.name}] Error:`, err.message);
    }
  });

  ws.on("close", () => {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    console.log(`[${ACTIVE_STYLE.name}] Disconnected. Reconnecting in 3s...`);
    setTimeout(connect, 3000);
  });

  ws.on("error", (err) => {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    console.error(`[${ACTIVE_STYLE.name}] WebSocket error:`, err.message);
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
    }
    connect();
  } catch (err) {
    console.error(`[${ACTIVE_STYLE.name}] Startup failed:`, err.message);
    process.exit(1);
  }
})();
