import { query } from "./db";
import { broadcastToRoom } from "./ws";
import { v4 as uuid } from "uuid";

const DEMO_OPERATOR_ID = "demo-operator-001";
const DROP_INTERVAL_MS = parseInt(process.env.DEMO_DROP_INTERVAL_MS || "30000", 10);
const CYCLE_DURATION_MS = 15000;

interface DemoState {
  running: boolean;
  totalRevenue: number;
  totalClaims: number;
  totalDrops: number;
  fillRate: number;
  activeCycles: number;
}

const state: DemoState = {
  running: false,
  totalRevenue: 0,
  totalClaims: 0,
  totalDrops: 0,
  fillRate: 85,
  activeCycles: 0,
};

const DROP_TEMPLATES = [
  { name: "Hot Flow Yoga", type: "Flash Drop", studio: "Cambridge Yoga", priceCents: 3600, spots: 1 },
  { name: "Power Yoga", type: "Urgent Fill", studio: "Cambridge Yoga", priceCents: 2300, spots: 2 },
  { name: "Vinyasa Yoga", type: "Flash Drop", studio: "Cambridge Yoga", priceCents: 1800, spots: 4 },
  { name: "Stretch & Recover", type: "Last Chance", studio: "Cambridge Yoga", priceCents: 3500, spots: 1 },
  { name: "HIIT Express", type: "Open Spot", studio: "Iron Forge Fitness", priceCents: 2500, spots: 3 },
  { name: "CrossFit WOD", type: "Flash Drop", studio: "Iron Forge Fitness", priceCents: 2000, spots: 2 },
  { name: "Pilates Core", type: "Urgent Fill", studio: "Zen Studio Boston", priceCents: 2800, spots: 1 },
  { name: "Barre Burn", type: "Last Chance", studio: "Zen Studio Boston", priceCents: 3200, spots: 2 },
];

const AGENTS = ["HAWK", "ACE", "BLITZ", "GHOST", "Agent O"];

let templateIndex = 0;

function emitDemoEvent(type: string, actor: string, payload: Record<string, unknown>): void {
  const event = {
    id: uuid(),
    operator_id: DEMO_OPERATOR_ID,
    type,
    actor,
    payload,
    created_at: new Date().toISOString(),
  };
  broadcastToRoom(DEMO_OPERATOR_ID, event);
}

async function runSingleCycle(): Promise<void> {
  const template = DROP_TEMPLATES[templateIndex % DROP_TEMPLATES.length];
  templateIndex++;
  state.activeCycles++;
  state.totalDrops++;

  try {
    const offerings = await query(
      `SELECT id FROM offerings WHERE operator_id = $1 LIMIT 1`,
      [DEMO_OPERATOR_ID]
    );
    const offeringId = offerings.rows[0]?.id;
    if (!offeringId) {
      console.log("[Demo] No offerings found, skipping cycle");
      state.activeCycles--;
      return;
    }

    const dropId = uuid();
    const launchedAt = new Date();
    const expiresAt = new Date(launchedAt.getTime() + 90000);
    const title = `${template.name} — ${template.type}`;

    await query(
      `INSERT INTO drops (id, operator_id, offering_id, title, spots_available, price_cents, timer_seconds, status, launched_at, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'live', $8, $9)`,
      [dropId, DEMO_OPERATOR_ID, offeringId, title, template.spots, template.priceCents, 90, launchedAt.toISOString(), expiresAt.toISOString()]
    );

    emitDemoEvent("drop_launched", "HAWK", {
      drop_id: dropId,
      title,
      spots_available: template.spots,
      price_cents: template.priceCents,
    });

    // Phase 2: Agent evaluation (3s)
    setTimeout(() => {
      emitDemoEvent("agents_evaluating", "System", {
        drop_id: dropId,
        agents: AGENTS,
        scores: AGENTS.map((a) => ({ name: a, score: 50 + Math.floor(Math.random() * 45) })),
      });
    }, 3000);

    // Phase 3: Winning agent claims (6s)
    const winner = AGENTS[Math.floor(Math.random() * AGENTS.length)];
    setTimeout(async () => {
      const rushList = await query(
        `SELECT id, phone, name FROM rush_list_members WHERE operator_id = $1 LIMIT 1`,
        [DEMO_OPERATOR_ID]
      );
      const member = rushList.rows[0];
      if (!member) return;

      const claimId = uuid();
      await query(
        `INSERT INTO claims (id, drop_id, claimant_phone, claimant_name, status)
         VALUES ($1, $2, $3, $4, 'pending')`,
        [claimId, dropId, member.phone, member.name]
      );

      emitDemoEvent("claim_received", winner, {
        drop_id: dropId,
        claim_id: claimId,
        claimant_name: member.name,
        agent: winner,
      });

      // Phase 4: Auto-confirm (9s)
      setTimeout(async () => {
        await query(
          `UPDATE claims SET status = 'confirmed', confirmed_at = NOW() WHERE id = $1`,
          [claimId]
        );
        emitDemoEvent("claim_confirmed", "HAWK", {
          claim_id: claimId,
          drop_id: dropId,
          claimant_name: member.name,
        });

        // Phase 5: Fill drop (12s)
        setTimeout(async () => {
          await query(
            `UPDATE drops SET status = 'filled' WHERE id = $1`,
            [dropId]
          );
          state.totalRevenue += template.priceCents * template.spots;
          state.totalClaims += template.spots;
          state.activeCycles--;

          emitDemoEvent("drop_filled", "System", {
            drop_id: dropId,
            revenue_cents: template.priceCents * template.spots,
            agent: winner,
          });
        }, 3000);
      }, 3000);
    }, 6000);
  } catch (err) {
    console.error("[Demo] Cycle error:", err);
    state.activeCycles--;
  }
}

export function startDemoEngine(): void {
  if (state.running) return;
  state.running = true;
  console.log(`[Demo] Engine started — drops every ${DROP_INTERVAL_MS / 1000}s, ${CYCLE_DURATION_MS / 1000}s cycles`);

  setTimeout(() => runSingleCycle(), 5000);
  setInterval(() => runSingleCycle(), DROP_INTERVAL_MS);
}

export function getDemoState(): DemoState {
  return { ...state };
}
