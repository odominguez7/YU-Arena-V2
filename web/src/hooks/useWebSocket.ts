import { useEffect, useRef, useState, useCallback } from "react";

export interface WsEvent {
  id: string;
  operator_id?: string;
  type: string;
  actor: string;
  payload: Record<string, unknown>;
  created_at: string;
}

interface UseWebSocketResult {
  connected: boolean;
  events: WsEvent[];
}

export function useWebSocket(operatorId: string | null): UseWebSocketResult {
  const [connected, setConnected] = useState(false);
  const [events, setEvents] = useState<WsEvent[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  const addEvent = useCallback((evt: WsEvent) => {
    setEvents((prev) => [evt, ...prev]);
  }, []);

  useEffect(() => {
    if (!operatorId) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws?operatorId=${operatorId}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);

    ws.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data);
        if (data.type === "connected") return;
        addEvent(data as WsEvent);
      } catch {
        // ignore
      }
    };

    return () => {
      ws.close();
      wsRef.current = null;
      setConnected(false);
    };
  }, [operatorId, addEvent]);

  return { connected, events };
}
