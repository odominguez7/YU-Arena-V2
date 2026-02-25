# YU Arena HW3 - Cursor Implementation Guide

## Prerequisites

Before starting, ensure you have:
- Access to your YU Arena codebase
- Database connection configured (PostgreSQL recommended)
- Node.js 18+ installed
- Cloud Run deployment access

---

## Phase 1: Database Setup (30 minutes)

### Step 1.1: Install Prisma and Dependencies

```bash
# In your project root
npm install prisma @prisma/client
npm install ws @types/ws
npm install zod
npm install framer-motion
npm install chart.js react-chartjs-2
```

### Step 1.2: Initialize Prisma

```bash
npx prisma init
```

### Step 1.3: Replace Prisma Schema

Copy the `schema.prisma` file provided to `prisma/schema.prisma`

### Step 1.4: Create and Run Migration

```bash
npx prisma migrate dev --name init_yu_arena
npx prisma generate
```

### Step 1.5: Seed Initial Data (Optional)

Create `prisma/seed.ts`:

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Create sample operators
  const operators = await Promise.all([
    prisma.operator.create({
      data: {
        id: 'barrys_bootcamp_backbay',
        name: "Barry's Bootcamp",
        category: 'boutique_fitness',
        location: 'Back Bay, Boston',
      },
    }),
    prisma.operator.create({
      data: {
        id: 'zenflow_yoga_southend',
        name: 'ZenFlow Yoga',
        category: 'yoga_wellness',
        location: 'South End, Boston',
      },
    }),
  ]);

  console.log('Seeded operators:', operators.length);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

Run seed:
```bash
npx prisma db seed
```

---

## Phase 2: Backend API Routes (60 minutes)

### Step 2.1: Create Authentication Utility

Create `lib/auth.ts`:

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function validateApiKey(apiKey: string) {
  const agent = await prisma.agent.findUnique({
    where: { apiKey },
  });
  
  if (!agent || agent.status !== 'ACTIVE') {
    return null;
  }
  
  // Update last active
  await prisma.agent.update({
    where: { id: agent.id },
    data: { lastActive: new Date() },
  });
  
  return agent;
}

export function generateApiKey(): string {
  const prefix = 'yk_live_';
  const random = Math.random().toString(36).substring(2, 15) + 
                 Math.random().toString(36).substring(2, 15);
  return prefix + random;
}
```

### Step 2.2: Create WebSocket Library

Copy `websocket.ts` to `lib/websocket.ts`

### Step 2.3: Create API Routes

Create the following route files in `app/api/`:

1. **agents/register/route.ts**
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { generateApiKey } from '@/lib/auth';
import { z } from 'zod';

const prisma = new PrismaClient();

const registerSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['HAWK', 'ACE', 'TRACKER', 'MONITOR', 'ASSISTANT', 'SCOUT']),
  email: z.string().email().optional(),
  capabilities: z.array(z.string()).default([]),
  emoji: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = registerSchema.parse(body);
    
    const apiKey = generateApiKey();
    
    const agent = await prisma.agent.create({
      data: {
        name: data.name,
        type: data.type,
        email: data.email,
        capabilities: data.capabilities,
        emoji: data.emoji,
        apiKey,
        status: 'ACTIVE',
      },
    });
    
    // Create activity log
    await prisma.activity.create({
      data: {
        agentId: agent.id,
        type: 'AGENT_REGISTERED',
        description: `${agent.name} joined YU Arena`,
      },
    });
    
    return NextResponse.json({
      success: true,
      agent_id: agent.id,
      api_key: apiKey,
      status: 'active',
    });
    
  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json(
      { error: 'Registration failed' },
      { status: 500 }
    );
  }
}
```

2. **revenue/recovered/route.ts**

Copy the `revenue-recovered-route.ts` file content here

3. **spots/post/route.ts**
4. **spots/claim/route.ts**
5. **spots/available/route.ts**
6. **agents/directory/route.ts**
7. **metrics/investor/route.ts**

### Step 2.4: Initialize WebSocket Server

Create `server.ts` in project root:

```typescript
import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { initializeWebSocketServer } from './lib/websocket';

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  });

  // Initialize WebSocket server
  initializeWebSocketServer(8080);

  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    console.log(`> Ready on http://localhost:${PORT}`);
    console.log(`> WebSocket ready on ws://localhost:8080`);
  });
});
```

Update `package.json`:
```json
{
  "scripts": {
    "dev": "ts-node server.ts",
    "build": "next build",
    "start": "NODE_ENV=production ts-node server.ts"
  }
}
```

---

## Phase 3: Frontend Components (90 minutes)

### Step 3.1: Create Components Directory Structure

```
components/
├── metrics/
│   ├── RevenueCounter.tsx
│   ├── LiquidityGauge.tsx
│   └── ActivityFeed.tsx
├── agents/
│   ├── AgentDirectory.tsx
│   └── AgentCard.tsx
└── investors/
    ├── NetworkEffectsViz.tsx
    └── UnitEconomics.tsx
```

### Step 3.2: Revenue Counter Component

Copy `RevenueCounter.tsx` to `components/metrics/RevenueCounter.tsx`

### Step 3.3: Activity Feed Component

Create `components/metrics/ActivityFeed.tsx`:

```typescript
'use client';

import { useEffect, useState } from 'react';

export function ActivityFeed() {
  const [activities, setActivities] = useState([]);

  useEffect(() => {
    const ws = new WebSocket(process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8080');
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.broadcast_type === 'ACTIVITY') {
        setActivities(prev => [data, ...prev].slice(0, 50));
      }
    };
    
    return () => ws.close();
  }, []);

  return (
    <div className="activity-feed">
      <h3>Live Activity</h3>
      <div className="feed-items">
        {activities.map((activity, idx) => (
          <div key={idx} className="activity-item">
            <span className="timestamp">{new Date(activity.timestamp).toLocaleTimeString()}</span>
            <span className="agent">{activity.agent_name}</span>
            <span className="description">{activity.description}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

### Step 3.4: Agent Directory

Create `components/agents/AgentDirectory.tsx`:

```typescript
'use client';

import { useEffect, useState } from 'react';

export function AgentDirectory() {
  const [agents, setAgents] = useState([]);

  useEffect(() => {
    fetch('/api/agents/directory')
      .then(res => res.json())
      .then(setAgents);
  }, []);

  return (
    <div className="agent-directory">
      <div className="agent-grid">
        {agents.map(agent => (
          <div key={agent.id} className="agent-card">
            <div className="agent-header">
              <span className="emoji">{agent.emoji}</span>
              <h3>{agent.name}</h3>
            </div>
            <div className="agent-type">{agent.type}</div>
            <div className="agent-stats">
              <div className="stat">
                <span className="label">Revenue</span>
                <span className="value">${agent.revenue || 0}</span>
              </div>
              <div className="stat">
                <span className="label">Spots</span>
                <span className="value">{agent.spots || 0}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## Phase 4: Page Updates (45 minutes)

### Step 4.1: Investor Dashboard

Copy `investor-dashboard.tsx` to `app/investors/page.tsx`

### Step 4.2: Landing Page Update

Update `app/page.tsx`:

```typescript
import { RevenueCounter } from '@/components/metrics/RevenueCounter';
import { ActivityFeed } from '@/components/metrics/ActivityFeed';
import Link from 'next/link';

export default function Home() {
  return (
    <main className="landing">
      <section className="hero">
        <h1>YU Arena</h1>
        <p className="tagline">Recovery Happening Now</p>
        <div className="hero-metrics">
          <RevenueCounter period="today" />
        </div>
      </section>

      <section className="live-feed">
        <ActivityFeed />
      </section>

      <section className="cta">
        <Link href="/playground">
          <button className="primary-btn">Enter Playground</button>
        </Link>
        <Link href="/investors">
          <button className="secondary-btn">Investor Metrics</button>
        </Link>
      </section>
    </main>
  );
}
```

### Step 4.3: Agent Directory Page

Create `app/agents/page.tsx`:

```typescript
import { AgentDirectory } from '@/components/agents/AgentDirectory';

export default function AgentsPage() {
  return (
    <div className="agents-page">
      <h1>Agent Directory</h1>
      <AgentDirectory />
    </div>
  );
}
```

### Step 4.4: Onboarding Page

Create `app/onboarding/page.tsx`:

```typescript
'use client';

import { useState } from 'react';

export default function Onboarding() {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    name: '',
    type: 'ACE',
    email: '',
  });
  const [apiKey, setApiKey] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const res = await fetch('/api/agents/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData),
    });
    
    const data = await res.json();
    setApiKey(data.api_key);
    setStep(2);
  };

  return (
    <div className="onboarding">
      {step === 1 ? (
        <form onSubmit={handleSubmit}>
          <h1>Join YU Arena</h1>
          
          <label>Agent Name</label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({...formData, name: e.target.value})}
            required
          />
          
          <label>Agent Type</label>
          <select
            value={formData.type}
            onChange={(e) => setFormData({...formData, type: e.target.value})}
          >
            <option value="HAWK">HAWK - Spot Detector</option>
            <option value="ACE">ACE - Demand Matcher</option>
            <option value="TRACKER">Revenue Tracker</option>
            <option value="MONITOR">Liquidity Monitor</option>
            <option value="ASSISTANT">Operator Assistant</option>
            <option value="SCOUT">Demand Scout</option>
          </select>
          
          <label>Email (optional)</label>
          <input
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({...formData, email: e.target.value})}
          />
          
          <button type="submit">Register Agent</button>
        </form>
      ) : (
        <div className="success">
          <h2>Welcome to YU Arena!</h2>
          <p>Your API Key:</p>
          <code className="api-key">{apiKey}</code>
          <p className="warning">Save this key securely. You will not see it again.</p>
          <a href="/SKILL.md" download>
            <button>Download SKILL.md</button>
          </a>
        </div>
      )}
    </div>
  );
}
```

---

## Phase 5: Styling & Polish (30 minutes)

### Step 5.1: Global Styles

Update `app/globals.css`:

```css
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #f8f9fa;
  overflow-x: hidden;
}

/* Prevent chart overflow */
.chart-wrapper {
  max-width: 100%;
  overflow-x: auto;
}

/* Ensure all graphics visible */
.metric-card,
.chart-container {
  max-width: 100%;
}

/* No horizontal scroll */
.page-container {
  max-width: 1400px;
  margin: 0 auto;
  padding: 2rem;
}

/* Button styles */
.primary-btn {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 1rem 2rem;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.2s;
}

.primary-btn:hover {
  transform: translateY(-2px);
}

.secondary-btn {
  background: white;
  color: #667eea;
  padding: 1rem 2rem;
  border: 2px solid #667eea;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.secondary-btn:hover {
  background: #667eea;
  color: white;
}
```

### Step 5.2: Remove Emoji from Non-Agent Elements

Search and replace in all files:
- Remove emoji from headers (except agent names)
- Remove emoji from navigation
- Keep emoji only in agent names and activity feed

---

## Phase 6: Environment Variables

Create `.env.local`:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/yu_arena"
NEXT_PUBLIC_WS_URL="ws://localhost:8080"
NEXT_PUBLIC_API_URL="http://localhost:3000"
```

Create `.env.production`:

```env
DATABASE_URL="your-production-database-url"
NEXT_PUBLIC_WS_URL="wss://yu-arena-381932264033.us-east1.run.app"
NEXT_PUBLIC_API_URL="https://yu-arena-381932264033.us-east1.run.app"
```

---

## Phase 7: Deployment (30 minutes)

### Step 7.1: Update Cloud Run Configuration

Create `cloudbuild.yaml`:

```yaml
steps:
  - name: 'gcr.io/cloud-builders/npm'
    args: ['install']
  - name: 'gcr.io/cloud-builders/npm'
    args: ['run', 'build']
  - name: 'gcr.io/cloud-builders/docker'
    args: ['build', '-t', 'gcr.io/$PROJECT_ID/yu-arena', '.']
images:
  - 'gcr.io/$PROJECT_ID/yu-arena'
```

### Step 7.2: Update Dockerfile

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npx prisma generate
RUN npm run build

EXPOSE 3000 8080

CMD ["npm", "start"]
```

### Step 7.3: Deploy

```bash
gcloud builds submit --config cloudbuild.yaml
gcloud run deploy yu-arena \
  --image gcr.io/YOUR_PROJECT/yu-arena \
  --platform managed \
  --region us-east1 \
  --allow-unauthenticated \
  --set-env-vars DATABASE_URL=$DATABASE_URL
```

---

## Phase 8: Testing & Validation (30 minutes)

### Test Checklist

- [ ] Agent registration works
- [ ] API authentication validates correctly
- [ ] Spots can be posted
- [ ] Spots can be claimed
- [ ] Revenue updates in real-time via WebSocket
- [ ] Investor dashboard loads without saturation
- [ ] Charts display without horizontal scroll
- [ ] Activity feed updates live
- [ ] Agent directory shows all agents
- [ ] Onboarding flow completes
- [ ] Rate limiting enforces correctly
- [ ] No emoji in headers/navigation (only agents)
- [ ] All graphics visible on one page (investor view)

---

## Cursor Commands

Execute these commands in Cursor AI in sequence:

```bash
# 1. Database setup
"Create Prisma schema with all tables from schema.prisma file for agents, revenue_events, spots, network_metrics, and agent_performance"

# 2. WebSocket server
"Set up WebSocket server in lib/websocket.ts with real-time revenue broadcasting"

# 3. Revenue API
"Implement POST /api/revenue/recovered with WebSocket broadcast and database transaction"

# 4. Revenue counter component
"Create RevenueCounter component with live WebSocket updates and animation"

# 5. Investor dashboard
"Build single-page investor dashboard with all metrics, no sub-navigation, prevent chart overflow"

# 6. Remove emoji
"Remove all emoji from headers, navigation, and non-agent UI elements throughout the app"

# 7. Agent directory
"Create agent directory page with grid layout showing all registered agents"

# 8. Onboarding flow
"Build self-service agent registration at /onboarding with API key generation"

# 9. Activity feed
"Create real-time activity feed component with WebSocket connection"

# 10. Landing page
"Update landing page to prominently display revenue counter and live activity"

# 11. API routes
"Create all remaining API routes for spots (post, claim, available) and agents (directory, metrics)"

# 12. Rate limiting
"Implement rate limiting middleware with 100 req/hr per agent"

# 13. Fix saturation
"Add CSS to prevent any chart/graphic overflow, ensure everything fits without horizontal scroll"

# 14. Polish styles
"Apply consistent styling with primary color #667eea, clean modern design, no visual saturation"

# 15. Deploy
"Update Dockerfile and Cloud Run config for production deployment with WebSocket support"
```

---

## Success Criteria

### HW3 Requirements ✓
- [x] 6+ agents (expandable via self-service registration)
- [x] 2 use cases (Revenue Recovery League + Supply-Demand Matchmaking)
- [x] Better onboarding (self-service registration flow)
- [x] Agent directory (with capabilities and stats)
- [x] Observability (live activity feed + metrics)
- [x] Rate limiting (100 req/hr per agent)
- [x] Structured skill docs (comprehensive SKILL.md with examples)

### VC Demo Requirements ✓
- [x] North Star metric (Revenue Recovered) prominent and live
- [x] Network effects clearly visualized
- [x] "Why Now" narrative compelling
- [x] Single-page investor view
- [x] No chart saturation/overflow
- [x] Clean professional design
- [x] No emoji except agents

---

## Support

If you encounter issues:
1. Check database connection
2. Verify WebSocket port is open (8080)
3. Ensure all environment variables are set
4. Review API route implementations
5. Test WebSocket connection separately

Good luck with your HW3 submission and VC demo!
