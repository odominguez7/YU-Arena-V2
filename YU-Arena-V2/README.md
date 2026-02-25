# YU Arena V2 — Multi-Agent Revenue Recovery Platform

> **MIT AI Studio · HW3 Submission**
> Built by Omar Dominguez

## Overview

YU Arena is a **multi-agent AI competition platform** that solves a critical business problem: **service businesses lose 15-30% of revenue to last-minute cancellations**. With only 2-6 hours notice, manual recovery achieves ~12% fill rates. YU Arena deploys specialized AI agents that autonomously detect, evaluate, and fill these empty slots — recovering revenue that would otherwise be lost.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   YU Arena Platform                  │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐          │
│  │  🦅 HAWK  │  │  🎯 ACE   │  │  ⚡ BLITZ │          │
│  │ Detection │  │ Conversion│  │  Speed   │          │
│  │  Scanner  │  │  Closer   │  │ Specialist│         │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘          │
│       │              │              │                │
│  ┌──────────┐  ┌──────────┐                         │
│  │  👻 GHOST │  │  🤖 Agent O│                        │
│  │ Premium   │  │ Orchestr- │                        │
│  │  Hunter   │  │   ator    │                        │
│  └────┬─────┘  └────┬─────┘                         │
│       │              │                               │
│  ─────┼──────────────┼──── WebSocket ────────────── │
│       │              │                               │
│  ┌────┴──────────────┴─────────────────────┐        │
│  │        Express API + PostgreSQL          │        │
│  │  • Drops lifecycle (create→claim→fill)   │        │
│  │  • Real-time event broadcasting          │        │
│  │  • Rush list management                  │        │
│  │  • Demo simulation engine                │        │
│  └────────────────────┬────────────────────┘        │
│                       │                              │
│  ┌────────────────────┴────────────────────┐        │
│  │         React Arena Demo UI              │        │
│  │  • Real-time agent visualization         │        │
│  │  • Live event feed                       │        │
│  │  • Business impact metrics               │        │
│  │  • Demo Insights panel                   │        │
│  └──────────────────────────────────────────┘        │
└─────────────────────────────────────────────────────┘
```

## Multi-Agent System

### Agent Specializations

| Agent | Role | Strategy | Speed |
|-------|------|----------|-------|
| 🦅 HAWK | Detection | Scans schedules for cancellations, creates drops | 30s scan intervals |
| 🎯 ACE | Conversion | Targets high-value yoga/wellness slots | 3s claim speed |
| ⚡ BLITZ | Speed | Universal fast-claimer, first-mover advantage | 1.5s claim speed |
| 👻 GHOST | Stealth | Targets premium/VIP/express slots | 4s claim speed |
| 🤖 Agent O | Orchestrator | Strategy optimization, meta-analysis | Adaptive |

### Agent Workflow (15-second cycle)

```
t+0s:  🦅 HAWK detects cancellation → creates drop
t+3s:  🔍 All agents evaluate opportunity (scoring, confidence)
t+6s:  🎯 Winning agent submits claim (customer matching)
t+9s:  ⏳ Claim processing and confirmation
t+12s: ✅ Revenue recovered, drop filled
t+15s: 📊 Metrics updated, next cycle begins
```

Drops are launched every **30 seconds**, with each complete recovery cycle taking **15 seconds**. This creates overlapping cycles for visual density during demos.

## Key Features

### Core Platform
- **Real-time WebSocket event streaming** — all agent actions visible instantly
- **Operator dashboard** — business owners manage offerings, schedules, rush lists
- **Public claim links** — customers claim spots via shareable URLs
- **Drop lifecycle** — live → claimed → confirmed → filled (or expired)

### Demo & Visualization
- **Arena Demo UI** — single-page VC pitch view with all metrics
- **Agent leaderboard** — real-time revenue rankings
- **Live event feed** — stream of agent decisions and actions
- **Progress indicators** — visual cycle phases (detect → evaluate → claim → confirm)
- **Conversion probability** — predictive analytics per drop

### A+ Differentiation
- **Demo Insights panel** — agent performance matrix, business impact metrics
- **Real-time ROI calculator** — compares AI vs manual recovery rates
- **Agent decision trees** — visual flow of the HAWK→Evaluate→Claim→Confirm pipeline
- **Confidence scoring** — per-agent, per-drop probability assessment
- **Business impact metrics** — projected annual recovery, utilization rates

## Problem Being Solved

Service businesses (yoga studios, fitness centers, wellness providers) face a critical revenue problem:

- **15-30% of booked sessions** are cancelled last-minute
- **2-6 hour notice windows** make manual recovery nearly impossible
- **~12% manual fill rate** — most cancelled slots go empty
- **$150B+ annual industry loss** from unfilled cancellations

YU Arena's multi-agent system achieves **85%+ fill rates** by:
1. Automatically detecting cancellations (HAWK)
2. Competitively evaluating opportunities (all agents)
3. Matching rush list customers to open slots (ACE/BLITZ/GHOST)
4. Auto-confirming bookings in seconds (system)

## Quick Start

### Prerequisites
- Node.js 20+
- PostgreSQL 14+

### Development

```bash
# 1. Install dependencies
cd server && npm install
cd ../web && npm install

# 2. Set up database
createdb yu_arena
cp .env.example .env  # Edit with your DB credentials

# 3. Start server (auto-creates schema + seeds demo data)
cd server && npm run dev

# 4. Start frontend
cd web && npm run dev

# 5. Open Arena Demo
open http://localhost:5173

# 6. (Optional) Start agents
cd agents/hawk && npm install && node index.js
cd agents/ace && npm install && AGENT_STYLE=0 node index.js  # ACE
cd agents/ace && AGENT_STYLE=1 node index.js                 # BLITZ
cd agents/ace && AGENT_STYLE=2 node index.js                 # GHOST
```

### Demo Mode
The Arena Demo includes a built-in simulation engine that runs automatically — no agents or database required for the visual demo. The simulation creates realistic drop cycles every 30 seconds with full agent workflow visualization.

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite
- **Backend**: Express + TypeScript + PostgreSQL
- **Real-time**: WebSocket (ws)
- **Auth**: JWT + access codes
- **Agents**: Node.js WebSocket clients
- **Deployment**: Docker + Google Cloud Run

## Project Structure

```
├── web/                    # React frontend
│   └── src/
│       ├── components/
│       │   ├── ArenaDemo.tsx    # VC demo page (main)
│       │   ├── Dashboard.tsx    # Operator dashboard
│       │   └── ...
│       ├── hooks/
│       └── index.css           # Design system
├── server/                 # Express API
│   └── src/
│       ├── index.ts            # Server entry
│       ├── routes.ts           # API routes
│       ├── ws.ts               # WebSocket
│       ├── db.ts               # PostgreSQL
│       ├── demo-engine.ts      # Auto-simulation
│       └── auth.ts             # JWT auth
├── agents/
│   ├── hawk/               # 🦅 Detection agent
│   ├── ace/                # 🎯 Conversion agent (ACE/BLITZ/GHOST)
│   ├── scout/              # Legacy scout
│   └── closer/             # Legacy closer
└── Dockerfile              # Production build
```

## License

MIT — Built at MIT AI Studio
