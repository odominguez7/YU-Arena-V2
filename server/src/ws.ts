import { WebSocketServer, WebSocket } from "ws";
import { Server } from "http";
import url from "url";

const roomClients = new Map<string, Set<WebSocket>>();
const roomPresence = new Map<string, Map<string, number>>();

function touchPresence(roomId: string, actor: string): void {
  if (!roomPresence.has(roomId)) roomPresence.set(roomId, new Map());
  roomPresence.get(roomId)!.set(actor, Date.now());
}

export function getPresence(roomId: string): { actor: string; last_seen: number }[] {
  const map = roomPresence.get(roomId);
  if (!map) return [];
  return Array.from(map.entries()).map(([actor, last_seen]) => ({ actor, last_seen }));
}

export function setupWebSocket(server: Server): void {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws: WebSocket, req) => {
    const parsed = url.parse(req.url || "", true);
    const roomId = (parsed.query.operatorId as string) || (parsed.query.roomId as string);

    if (!roomId) {
      ws.close(4000, "Missing operatorId (or legacy roomId) query parameter");
      return;
    }

    if (!roomClients.has(roomId)) roomClients.set(roomId, new Set());
    roomClients.get(roomId)!.add(ws);

    ws.send(JSON.stringify({ type: "connected", roomId }));

    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg?.type === "agent_heartbeat" && typeof msg.actor === "string") {
          touchPresence(roomId, msg.actor);
        }
      } catch {
        // ignore malformed messages
      }
    });

    ws.on("close", () => {
      const clients = roomClients.get(roomId);
      if (clients) {
        clients.delete(ws);
        if (clients.size === 0) roomClients.delete(roomId);
      }
    });

    ws.on("error", () => {
      const clients = roomClients.get(roomId);
      if (clients) clients.delete(ws);
    });
  });
}

export function broadcastToRoom(roomId: string, event: Record<string, unknown>): void {
  const clients = roomClients.get(roomId);
  if (!clients) return;

  const message = JSON.stringify(event);
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) ws.send(message);
  }
}
