const WebSocket = require("ws");

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:3001";
const API_BASE = BASE_URL + "/api";
const API_KEY = process.env.API_KEY || process.env.SCOUT_API_KEY || "yu-scout-key-demo";
const ROOM_ID = process.env.ROOM_ID;

if (!ROOM_ID) {
  console.error("ERROR: ROOM_ID environment variable is required.");
  process.exit(1);
}

const headers = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${API_KEY}`,
};

async function postMessage(text) {
  try {
    await fetch(`${API_BASE}/rooms/${ROOM_ID}/messages`, {
      method: "POST",
      headers,
      body: JSON.stringify({ text }),
    });
  } catch (err) {
    console.error("[Scout] Failed to post message:", err.message);
  }
}

async function postDecision(opportunityId, decision, score, reasons) {
  try {
    await fetch(`${API_BASE}/rooms/${ROOM_ID}/decisions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        opportunity_id: opportunityId,
        decision,
        score,
        reasons,
      }),
    });
  } catch (err) {
    console.error("[Scout] Failed to post decision:", err.message);
  }
}

function evaluateOpportunity(payload) {
  const title = String(payload.title || "").toLowerCase();
  let score = 50;
  const reasons = [];

  if (title.includes("open") || title.includes("slot")) { score += 15; reasons.push("capacity keywords"); }
  if (title.includes("urgent") || title.includes("last")) { score += 10; reasons.push("urgency"); }
  if (title.length > 8) { score += 10; reasons.push("descriptive title"); }

  const decision = score >= 60 ? "CLAIM" : "IGNORE";
  return { decision, score, reasons };
}

function connect() {
  const wsUrl = BASE_URL.replace(/^http/, "ws") + `/ws?roomId=${ROOM_ID}`;
  console.log(`[Scout] Connecting to ${wsUrl}`);

  const ws = new WebSocket(wsUrl);
  let heartbeatTimer = null;

  ws.on("open", async () => {
    console.log("[Scout] Connected to room", ROOM_ID);

    const sendHeartbeat = () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "agent_heartbeat", actor: "Scout" }));
      }
    };
    sendHeartbeat();
    heartbeatTimer = setInterval(sendHeartbeat, 5000);

    await postMessage("Scout online. Monitoring for new opportunities...");
  });

  ws.on("message", async (raw) => {
    try {
      const event = JSON.parse(raw.toString());
      if (event.type === "connected") return;

      if (event.type === "opportunity_created") {
        const payload = event.payload || {};
        const { decision, score, reasons } = evaluateOpportunity(payload);

        await postDecision(payload.opportunity_id, decision, score, reasons);
        await postMessage(
          decision === "CLAIM"
            ? `Recommendation: CLAIM "${payload.title}" (score=${score}). Closer, pick this up.`
            : `Recommendation: IGNORE "${payload.title}" (score=${score}).`
        );
      }
    } catch (err) {
      console.error("[Scout] Error processing message:", err.message);
    }
  });

  ws.on("close", () => {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    console.log("[Scout] Disconnected. Reconnecting in 3s...");
    setTimeout(connect, 3000);
  });

  ws.on("error", (err) => {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    console.error("[Scout] WebSocket error:", err.message);
  });
}

connect();
