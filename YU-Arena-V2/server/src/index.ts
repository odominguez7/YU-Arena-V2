import express from "express";
import cors from "cors";
import http from "http";
import path from "path";
import fs from "fs";
import { setupWebSocket } from "./ws";
import routes, { expireLiveDrops } from "./routes";
import { initDb } from "./db";
import { startDemoEngine, getDemoState } from "./demo-engine";

// ─── Load .env from project root (dev only) ──────────

const envPath = path.join(__dirname, "..", "..", ".env");
try {
  const envContent = fs.readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
} catch {
  // .env not found — use process env directly (normal on Cloud Run)
}

const app = express();
const server = http.createServer(app);

// ─── Middleware ───────────────────────────────────────

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      cb(null, true);
    },
    credentials: true,
  })
);
app.use(express.json());

// ─── Health check ────────────────────────────────────

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "yu-arena", timestamp: new Date().toISOString() });
});

app.get("/api/arena/state", (_req, res) => {
  res.json(getDemoState());
});

// ─── API Routes ──────────────────────────────────────

app.use("/api", routes);

// ─── Serve built frontend (production) ───────────────

const webDist = path.join(__dirname, "..", "..", "web", "dist");
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist, { maxAge: "1h" }));
  app.get(/^\/(?!api|ws).*/, (_req, res) => {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.sendFile(path.join(webDist, "index.html"));
  });
}

// ─── WebSocket ───────────────────────────────────────

setupWebSocket(server);

// ─── Start ───────────────────────────────────────────

const PORT = parseInt(process.env.PORT || "8080", 10);
const DROP_EXPIRY_SWEEP_MS = parseInt(process.env.DROP_EXPIRY_SWEEP_MS || "5000", 10);
initDb()
  .then(() => {
    setInterval(() => {
      expireLiveDrops().catch((err) => {
        console.error("Failed to expire drops:", err);
      });
    }, DROP_EXPIRY_SWEEP_MS);

    if (process.env.DEMO_AUTO_START !== "false") {
      startDemoEngine();
    }

    server.listen(PORT, "0.0.0.0", () => {
      console.log(`YU Arena API running on http://0.0.0.0:${PORT}`);
      console.log(`WebSocket at ws://0.0.0.0:${PORT}/ws?operatorId=<id>`);
      console.log(`Arena Demo at http://0.0.0.0:${PORT}/`);
    });
  })
  .catch((err) => {
    console.error("Failed to initialize database:", err);
    process.exit(1);
  });

export default app;
