// lib/websocket.ts
// WebSocket Server for Real-Time Revenue Updates

import { WebSocketServer, WebSocket } from 'ws';

// Track connected clients
const clients = new Set<WebSocket>();

// Initialize WebSocket server (call this in your server startup)
let wss: WebSocketServer | null = null;

export function initializeWebSocketServer(port: number = 8080) {
  if (wss) {
    console.log('WebSocket server already initialized');
    return wss;
  }

  wss = new WebSocketServer({ port });

  wss.on('connection', (ws: WebSocket) => {
    console.log('New WebSocket client connected');
    clients.add(ws);

    // Send initial connection message
    ws.send(JSON.stringify({
      type: 'CONNECTION_ESTABLISHED',
      timestamp: new Date().toISOString(),
    }));

    // Handle client messages (optional)
    ws.on('message', (message: string) => {
      try {
        const data = JSON.parse(message.toString());
        console.log('Received message from client:', data);
      } catch (error) {
        console.error('Invalid message from client:', error);
      }
    });

    // Handle client disconnect
    ws.on('close', () => {
      console.log('WebSocket client disconnected');
      clients.delete(ws);
    });

    // Handle errors
    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      clients.delete(ws);
    });
  });

  console.log(`WebSocket server started on port ${port}`);
  return wss;
}

// Broadcast revenue update to all connected clients
export async function broadcastRevenueUpdate(data: {
  type: string;
  amount: number;
  total_all_time: number;
  total_today: number;
  agent_id: string;
  agent_name: string;
  spot_id: string;
  operator_id: string;
  timestamp: string;
}) {
  const message = JSON.stringify(data);
  
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(message);
      } catch (error) {
        console.error('Failed to send to client:', error);
      }
    }
  });

  console.log(`Broadcasted revenue update to ${clients.size} clients`);
}

// Broadcast activity update
export async function broadcastActivity(data: {
  type: string;
  agent_id: string;
  agent_name: string;
  description: string;
  timestamp: string;
  metadata?: any;
}) {
  const message = JSON.stringify({
    ...data,
    broadcast_type: 'ACTIVITY',
  });
  
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(message);
      } catch (error) {
        console.error('Failed to send activity to client:', error);
      }
    }
  });
}

// Broadcast spot update
export async function broadcastSpotUpdate(data: {
  type: string;
  spot_id: string;
  status: string;
  operator_id: string;
  category: string;
  price: number;
  timestamp: string;
}) {
  const message = JSON.stringify({
    ...data,
    broadcast_type: 'SPOT_UPDATE',
  });
  
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(message);
      } catch (error) {
        console.error('Failed to send spot update to client:', error);
      }
    }
  });
}

// Get connected clients count
export function getConnectedClientsCount(): number {
  return clients.size;
}

// Cleanup function
export function closeWebSocketServer() {
  if (wss) {
    clients.forEach((client) => {
      client.close();
    });
    clients.clear();
    wss.close();
    wss = null;
    console.log('WebSocket server closed');
  }
}

// Export for external use
export { wss, clients };
