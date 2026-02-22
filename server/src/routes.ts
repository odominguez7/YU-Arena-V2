import { Router, Request, Response } from "express";
import { v4 as uuid } from "uuid";
import { query, withTransaction } from "./db";
import { requireOperator, OperatorRequest, loginHandler } from "./auth";
import { idempotency } from "./idempotency";
import { broadcastToRoom } from "./ws";
import { broadcastDrop } from "./whatsapp";

const router = Router();

const safe = <TReq extends Request>(
  handler: (req: TReq, res: Response) => Promise<unknown>
) => {
  return (req: TReq, res: Response): void => {
    handler(req, res).catch((err) => {
      console.error("Route error:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal server error" });
      }
    });
  };
};

type DropStatus = "live" | "filled" | "expired" | "cancelled";
type ClaimStatus = "pending" | "confirmed" | "rejected" | "expired";

interface OperatorEventRow {
  id: string;
  operator_id: string;
  type: string;
  actor: string;
  payload: unknown;
  created_at: string;
}

interface ExpiredDropRow {
  id: string;
  operator_id: string;
}

async function emitOperatorEvent(
  operatorId: string,
  type: string,
  actor: string,
  payload: Record<string, unknown> = {}
): Promise<OperatorEventRow> {
  const event: OperatorEventRow = {
    id: uuid(),
    operator_id: operatorId,
    type,
    actor,
    payload,
    created_at: new Date().toISOString(),
  };

  await query(
    `INSERT INTO operator_events (id, operator_id, type, actor, payload)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [event.id, event.operator_id, event.type, event.actor, JSON.stringify(event.payload)]
  );
  broadcastToRoom(operatorId, event as unknown as Record<string, unknown>);
  return event;
}

export async function expireLiveDrops(): Promise<number> {
  const expired = await query<ExpiredDropRow>(
    `UPDATE drops
     SET status = 'expired'
     WHERE status = 'live'
       AND expires_at <= NOW()
     RETURNING id, operator_id`
  );

  if (expired.rows.length === 0) return 0;

  const dropIds = expired.rows.map((d) => d.id);
  await query(
    `UPDATE claims
     SET status = 'expired'
     WHERE status = 'pending'
       AND drop_id = ANY($1::text[])`,
    [dropIds]
  );

  await Promise.all(
    expired.rows.map((d) =>
      emitOperatorEvent(d.operator_id, "drop_expired", "system", { drop_id: d.id })
    )
  );

  return expired.rows.length;
}

function asPositiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return parsed;
}

// ═══════════════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════════════

router.post("/auth/login", safe(loginHandler));

router.get("/auth/me", requireOperator, safe(async (req: OperatorRequest, res: Response) => {
  const result = await query<{
    id: string;
    business_name: string;
    phone: string | null;
    whatsapp_from_number: string | null;
    created_at: string;
  }>(
    `SELECT id, business_name, phone, whatsapp_from_number, created_at
     FROM operators
     WHERE id = $1`,
    [req.operatorId!]
  );
  const operator = result.rows[0];
  if (!operator) {
    res.status(404).json({ error: "Operator not found" });
    return;
  }
  res.json(operator);
}));

// ═══════════════════════════════════════════════════════════
// OFFERINGS CRUD
// ═══════════════════════════════════════════════════════════

router.get("/offerings", requireOperator, safe(async (req: OperatorRequest, res: Response) => {
  const offerings = await query(
    `SELECT * FROM offerings
     WHERE operator_id = $1
     ORDER BY created_at DESC`,
    [req.operatorId!]
  );
  res.json(offerings.rows);
}));

router.post("/offerings", requireOperator, safe(async (req: OperatorRequest, res: Response) => {
  const { name, default_price_cents, default_spots } = req.body ?? {};
  if (!name || typeof name !== "string") {
    res.status(400).json({ error: "name is required (string)" });
    return;
  }

  const price = Number(default_price_cents ?? 0);
  const spots = Number(default_spots ?? 1);
  if (!Number.isInteger(price) || price < 0) {
    res.status(400).json({ error: "default_price_cents must be an integer >= 0" });
    return;
  }
  if (!Number.isInteger(spots) || spots <= 0) {
    res.status(400).json({ error: "default_spots must be an integer > 0" });
    return;
  }

  const id = uuid();
  await query(
    `INSERT INTO offerings (id, operator_id, name, default_price_cents, default_spots)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, req.operatorId!, name.trim(), price, spots]
  );

  const created = await query(`SELECT * FROM offerings WHERE id = $1`, [id]);
  res.status(201).json(created.rows[0]);
}));

router.patch("/offerings/:id", requireOperator, safe(async (req: OperatorRequest, res: Response) => {
  const existing = await query(
    `SELECT * FROM offerings WHERE id = $1 AND operator_id = $2`,
    [req.params.id, req.operatorId!]
  );
  if (!existing.rows[0]) {
    res.status(404).json({ error: "Offering not found" });
    return;
  }

  const curr = existing.rows[0] as {
    name: string;
    default_price_cents: number;
    default_spots: number;
  };
  const nextName = typeof req.body?.name === "string" ? req.body.name.trim() : curr.name;
  const nextPrice = req.body?.default_price_cents ?? curr.default_price_cents;
  const nextSpots = req.body?.default_spots ?? curr.default_spots;

  if (!nextName) {
    res.status(400).json({ error: "name cannot be empty" });
    return;
  }
  if (!Number.isInteger(Number(nextPrice)) || Number(nextPrice) < 0) {
    res.status(400).json({ error: "default_price_cents must be an integer >= 0" });
    return;
  }
  if (!Number.isInteger(Number(nextSpots)) || Number(nextSpots) <= 0) {
    res.status(400).json({ error: "default_spots must be an integer > 0" });
    return;
  }

  await query(
    `UPDATE offerings
     SET name = $1, default_price_cents = $2, default_spots = $3
     WHERE id = $4 AND operator_id = $5`,
    [nextName, Number(nextPrice), Number(nextSpots), req.params.id, req.operatorId!]
  );
  const updated = await query(`SELECT * FROM offerings WHERE id = $1`, [req.params.id]);
  res.json(updated.rows[0]);
}));

router.delete("/offerings/:id", requireOperator, safe(async (req: OperatorRequest, res: Response) => {
  const deleted = await query(
    `DELETE FROM offerings WHERE id = $1 AND operator_id = $2`,
    [req.params.id, req.operatorId!]
  );
  if (deleted.rowCount === 0) {
    res.status(404).json({ error: "Offering not found" });
    return;
  }
  res.json({ ok: true });
}));

// ═══════════════════════════════════════════════════════════
// SCHEDULE CRUD
// ═══════════════════════════════════════════════════════════

router.get("/schedule", requireOperator, safe(async (req: OperatorRequest, res: Response) => {
  const blocks = await query(
    `SELECT sb.*, o.name AS offering_name
     FROM schedule_blocks sb
     JOIN offerings o ON o.id = sb.offering_id
     WHERE sb.operator_id = $1
     ORDER BY sb.day_of_week ASC, sb.start_time ASC`,
    [req.operatorId!]
  );
  res.json(blocks.rows);
}));

router.post("/schedule", requireOperator, safe(async (req: OperatorRequest, res: Response) => {
  const { offering_id, day_of_week, start_time, end_time, default_spots } = req.body ?? {};
  if (!offering_id || typeof offering_id !== "string") {
    res.status(400).json({ error: "offering_id is required" });
    return;
  }
  if (!Number.isInteger(Number(day_of_week)) || Number(day_of_week) < 0 || Number(day_of_week) > 6) {
    res.status(400).json({ error: "day_of_week must be an integer between 0 and 6" });
    return;
  }
  if (typeof start_time !== "string" || typeof end_time !== "string") {
    res.status(400).json({ error: "start_time and end_time are required (HH:MM)" });
    return;
  }
  if (!Number.isInteger(Number(default_spots)) || Number(default_spots) <= 0) {
    res.status(400).json({ error: "default_spots must be an integer > 0" });
    return;
  }

  const offering = await query(
    `SELECT id FROM offerings WHERE id = $1 AND operator_id = $2`,
    [offering_id, req.operatorId!]
  );
  if (!offering.rows[0]) {
    res.status(404).json({ error: "Offering not found" });
    return;
  }

  const id = uuid();
  await query(
    `INSERT INTO schedule_blocks
      (id, operator_id, offering_id, day_of_week, start_time, end_time, default_spots)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, req.operatorId!, offering_id, Number(day_of_week), start_time, end_time, Number(default_spots)]
  );
  const created = await query(`SELECT * FROM schedule_blocks WHERE id = $1`, [id]);
  res.status(201).json(created.rows[0]);
}));

router.patch("/schedule/:id", requireOperator, safe(async (req: OperatorRequest, res: Response) => {
  const existing = await query(
    `SELECT * FROM schedule_blocks WHERE id = $1 AND operator_id = $2`,
    [req.params.id, req.operatorId!]
  );
  const block = existing.rows[0] as {
    offering_id: string;
    day_of_week: number;
    start_time: string;
    end_time: string;
    default_spots: number;
  } | undefined;

  if (!block) {
    res.status(404).json({ error: "Schedule block not found" });
    return;
  }

  const nextOfferingId = typeof req.body?.offering_id === "string" ? req.body.offering_id : block.offering_id;
  const nextDay = req.body?.day_of_week ?? block.day_of_week;
  const nextStart = typeof req.body?.start_time === "string" ? req.body.start_time : block.start_time;
  const nextEnd = typeof req.body?.end_time === "string" ? req.body.end_time : block.end_time;
  const nextSpots = req.body?.default_spots ?? block.default_spots;

  if (!Number.isInteger(Number(nextDay)) || Number(nextDay) < 0 || Number(nextDay) > 6) {
    res.status(400).json({ error: "day_of_week must be an integer between 0 and 6" });
    return;
  }
  if (!Number.isInteger(Number(nextSpots)) || Number(nextSpots) <= 0) {
    res.status(400).json({ error: "default_spots must be an integer > 0" });
    return;
  }

  const offering = await query(
    `SELECT id FROM offerings WHERE id = $1 AND operator_id = $2`,
    [nextOfferingId, req.operatorId!]
  );
  if (!offering.rows[0]) {
    res.status(404).json({ error: "Offering not found" });
    return;
  }

  await query(
    `UPDATE schedule_blocks
     SET offering_id = $1, day_of_week = $2, start_time = $3, end_time = $4, default_spots = $5
     WHERE id = $6 AND operator_id = $7`,
    [nextOfferingId, Number(nextDay), nextStart, nextEnd, Number(nextSpots), req.params.id, req.operatorId!]
  );
  const updated = await query(`SELECT * FROM schedule_blocks WHERE id = $1`, [req.params.id]);
  res.json(updated.rows[0]);
}));

router.delete("/schedule/:id", requireOperator, safe(async (req: OperatorRequest, res: Response) => {
  const deleted = await query(
    `DELETE FROM schedule_blocks WHERE id = $1 AND operator_id = $2`,
    [req.params.id, req.operatorId!]
  );
  if (deleted.rowCount === 0) {
    res.status(404).json({ error: "Schedule block not found" });
    return;
  }
  res.json({ ok: true });
}));

router.get("/schedule/today", requireOperator, safe(async (req: OperatorRequest, res: Response) => {
  const dayOfWeek = new Date().getDay();
  const blocks = await query(
    `SELECT sb.*, o.name AS offering_name,
            COALESCE(ld.status, 'open') AS capacity_status
     FROM schedule_blocks sb
     JOIN offerings o ON o.id = sb.offering_id
     LEFT JOIN LATERAL (
       SELECT d.status
       FROM drops d
       WHERE d.schedule_block_id = sb.id
         AND d.operator_id = sb.operator_id
         AND d.launched_at::date = CURRENT_DATE
       ORDER BY d.launched_at DESC
       LIMIT 1
     ) ld ON TRUE
     WHERE sb.operator_id = $1 AND sb.day_of_week = $2
     ORDER BY sb.start_time ASC`,
    [req.operatorId!, dayOfWeek]
  );
  res.json(blocks.rows);
}));

// ═══════════════════════════════════════════════════════════
// DROPS LIFECYCLE
// ═══════════════════════════════════════════════════════════

router.post("/drops", requireOperator, idempotency, safe(async (req: OperatorRequest, res: Response) => {
  const {
    offering_id,
    schedule_block_id,
    title,
    spots_available,
    price_cents,
    timer_seconds,
  } = req.body ?? {};

  if (!offering_id || typeof offering_id !== "string") {
    res.status(400).json({ error: "offering_id is required" });
    return;
  }

  const offeringResult = await query<{
    id: string;
    name: string;
    default_price_cents: number;
    default_spots: number;
  }>(
    `SELECT id, name, default_price_cents, default_spots
     FROM offerings
     WHERE id = $1 AND operator_id = $2`,
    [offering_id, req.operatorId!]
  );
  const offering = offeringResult.rows[0];
  if (!offering) {
    res.status(404).json({ error: "Offering not found" });
    return;
  }

  let scheduleSpots = offering.default_spots;
  if (typeof schedule_block_id === "string") {
    const blockResult = await query<{ default_spots: number }>(
      `SELECT default_spots
       FROM schedule_blocks
       WHERE id = $1 AND operator_id = $2 AND offering_id = $3`,
      [schedule_block_id, req.operatorId!, offering_id]
    );
    const block = blockResult.rows[0];
    if (!block) {
      res.status(404).json({ error: "Schedule block not found for this offering" });
      return;
    }
    scheduleSpots = block.default_spots;
  }

  const finalSpots = asPositiveInt(spots_available, scheduleSpots);
  const finalPrice = Number.isInteger(Number(price_cents)) && Number(price_cents) >= 0
    ? Number(price_cents)
    : offering.default_price_cents;
  const finalTimer = asPositiveInt(timer_seconds, 90);
  const launchedAt = new Date();
  const expiresAt = new Date(launchedAt.getTime() + finalTimer * 1000);
  const dropId = uuid();
  const finalTitle = typeof title === "string" && title.trim() ? title.trim() : offering.name;

  await query(
    `INSERT INTO drops
      (id, operator_id, offering_id, schedule_block_id, title, spots_available, price_cents, timer_seconds, status, launched_at, expires_at)
     VALUES
      ($1, $2, $3, $4, $5, $6, $7, $8, 'live', $9, $10)`,
    [
      dropId,
      req.operatorId!,
      offering_id,
      typeof schedule_block_id === "string" ? schedule_block_id : null,
      finalTitle,
      finalSpots,
      finalPrice,
      finalTimer,
      launchedAt.toISOString(),
      expiresAt.toISOString(),
    ]
  );

  const created = await query(`SELECT * FROM drops WHERE id = $1`, [dropId]);
  await emitOperatorEvent(
    req.operatorId!,
    "drop_launched",
    req.operatorBusinessName || "operator",
    { drop_id: dropId, title: finalTitle, spots_available: finalSpots, price_cents: finalPrice }
  );

  broadcastDrop(req.operatorId!, dropId, finalTitle, finalPrice, finalSpots).catch((err) =>
    console.error("WhatsApp broadcast failed:", err)
  );

  res.status(201).json(created.rows[0]);
}));

router.get("/drops/history", requireOperator, safe(async (req: OperatorRequest, res: Response) => {
  await expireLiveDrops();
  const history = await query(
    `SELECT d.*,
            COALESCE(c.confirmed_claims, 0) AS confirmed_claims
     FROM drops d
     LEFT JOIN (
       SELECT drop_id, COUNT(*)::int AS confirmed_claims
       FROM claims
       WHERE status = 'confirmed'
       GROUP BY drop_id
     ) c ON c.drop_id = d.id
     WHERE d.operator_id = $1 AND d.status <> 'live'
     ORDER BY d.created_at DESC`,
    [req.operatorId!]
  );
  res.json(history.rows);
}));

router.get("/drops", requireOperator, safe(async (req: OperatorRequest, res: Response) => {
  await expireLiveDrops();
  const status = req.query.status as DropStatus | undefined;
  const validStatuses: DropStatus[] = ["live", "filled", "expired", "cancelled"];
  if (status && !validStatuses.includes(status)) {
    res.status(400).json({ error: "Invalid status filter" });
    return;
  }

  const drops = status
    ? await query(
        `SELECT d.*,
                COALESCE(c.claims_count, 0) AS claims_count
         FROM drops d
         LEFT JOIN (
           SELECT drop_id, COUNT(*)::int AS claims_count
           FROM claims
           GROUP BY drop_id
         ) c ON c.drop_id = d.id
         WHERE d.operator_id = $1 AND d.status = $2
         ORDER BY d.created_at DESC`,
        [req.operatorId!, status]
      )
    : await query(
        `SELECT d.*,
                COALESCE(c.claims_count, 0) AS claims_count
         FROM drops d
         LEFT JOIN (
           SELECT drop_id, COUNT(*)::int AS claims_count
           FROM claims
           GROUP BY drop_id
         ) c ON c.drop_id = d.id
         WHERE d.operator_id = $1
         ORDER BY d.created_at DESC`,
        [req.operatorId!]
      );
  res.json(drops.rows);
}));

router.get("/drops/:id", requireOperator, safe(async (req: OperatorRequest, res: Response) => {
  await expireLiveDrops();
  const dropResult = await query(
    `SELECT * FROM drops WHERE id = $1 AND operator_id = $2`,
    [req.params.id, req.operatorId!]
  );
  const drop = dropResult.rows[0];
  if (!drop) {
    res.status(404).json({ error: "Drop not found" });
    return;
  }

  const claims = await query(
    `SELECT * FROM claims WHERE drop_id = $1 ORDER BY claimed_at DESC`,
    [req.params.id]
  );
  res.json({ ...drop, claims: claims.rows });
}));

router.patch("/drops/:id", requireOperator, safe(async (req: OperatorRequest, res: Response) => {
  const dropResult = await query<{ id: string; status: DropStatus }>(
    `SELECT id, status FROM drops WHERE id = $1 AND operator_id = $2`,
    [req.params.id, req.operatorId!]
  );
  const drop = dropResult.rows[0];
  if (!drop) {
    res.status(404).json({ error: "Drop not found" });
    return;
  }

  const { action, additional_seconds } = req.body ?? {};
  if (action === "extend") {
    const extension = asPositiveInt(additional_seconds, 30);
    await query(
      `UPDATE drops
       SET timer_seconds = timer_seconds + $1,
           expires_at = expires_at + ($1 || ' seconds')::interval
       WHERE id = $2 AND operator_id = $3`,
      [extension, req.params.id, req.operatorId!]
    );
    await emitOperatorEvent(req.operatorId!, "drop_extended", req.operatorBusinessName || "operator", {
      drop_id: req.params.id,
      additional_seconds: extension,
    });
  } else if (action === "cancel" || action === "stop") {
    if (drop.status === "filled") {
      res.status(409).json({ error: "Cannot cancel a filled drop" });
      return;
    }
    const cancelled = await query(
      `UPDATE drops
       SET status = 'cancelled'
       WHERE id = $1 AND operator_id = $2 AND status = 'live'`,
      [req.params.id, req.operatorId!]
    );
    if (cancelled.rowCount === 0) {
      res.status(409).json({ error: "Only live drops can be cancelled or stopped" });
      return;
    }
    await query(
      `UPDATE claims
       SET status = 'expired'
       WHERE drop_id = $1 AND status = 'pending'`,
      [req.params.id]
    );
    await emitOperatorEvent(req.operatorId!, "drop_cancelled", req.operatorBusinessName || "operator", {
      drop_id: req.params.id,
    });
  } else {
    res.status(400).json({ error: "action must be one of: extend, cancel, stop" });
    return;
  }

  const updated = await query(`SELECT * FROM drops WHERE id = $1`, [req.params.id]);
  res.json(updated.rows[0]);
}));

// ═══════════════════════════════════════════════════════════
// CLAIMS LIFECYCLE
// ═══════════════════════════════════════════════════════════

router.post("/drops/:id/claim", idempotency, safe(async (req: Request, res: Response) => {
  const { claimant_phone, claimant_name } = req.body ?? {};
  if (!claimant_phone || typeof claimant_phone !== "string") {
    res.status(400).json({ error: "claimant_phone is required" });
    return;
  }
  if (!claimant_name || typeof claimant_name !== "string") {
    res.status(400).json({ error: "claimant_name is required" });
    return;
  }

  const dropResult = await query<{ id: string; operator_id: string; status: DropStatus; expires_at: string }>(
    `SELECT id, operator_id, status, expires_at
     FROM drops
     WHERE id = $1`,
    [req.params.id]
  );
  const drop = dropResult.rows[0];
  if (!drop) {
    res.status(404).json({ error: "Drop not found" });
    return;
  }
  if (drop.status !== "live") {
    res.status(409).json({ error: "Drop is not live" });
    return;
  }
  if (new Date(drop.expires_at).getTime() <= Date.now()) {
    await query(`UPDATE drops SET status = 'expired' WHERE id = $1`, [drop.id]);
    await query(
      `UPDATE claims
       SET status = 'expired'
       WHERE drop_id = $1 AND status = 'pending'`,
      [drop.id]
    );
    res.status(409).json({ error: "Drop has expired" });
    return;
  }

  const claimId = uuid();
  await query(
    `INSERT INTO claims (id, drop_id, claimant_phone, claimant_name, status)
     VALUES ($1, $2, $3, $4, 'pending')`,
    [claimId, drop.id, claimant_phone.trim(), claimant_name.trim()]
  );

  const created = await query(`SELECT * FROM claims WHERE id = $1`, [claimId]);
  await emitOperatorEvent(drop.operator_id, "claim_received", "customer", {
    drop_id: drop.id,
    claim_id: claimId,
    claimant_phone: claimant_phone.trim(),
    claimant_name: claimant_name.trim(),
  });
  res.status(201).json(created.rows[0]);
}));

router.patch("/claims/:id/confirm", requireOperator, safe(async (req: OperatorRequest, res: Response) => {
  const result = await withTransaction(async (client) => {
    const claimResult = await client.query<{
      id: string;
      drop_id: string;
      status: ClaimStatus;
      claimant_name: string;
      claimant_phone: string;
      operator_id: string;
      spots_available: number;
      drop_status: DropStatus;
      expires_at: string;
    }>(
      `SELECT c.id,
              c.drop_id,
              c.status,
              c.claimant_name,
              c.claimant_phone,
              d.operator_id,
              d.spots_available,
              d.status AS drop_status,
              d.expires_at
       FROM claims c
       JOIN drops d ON d.id = c.drop_id
       WHERE c.id = $1 AND d.operator_id = $2
       FOR UPDATE`,
      [req.params.id, req.operatorId!]
    );

    const claim = claimResult.rows[0];
    if (!claim) return { error: "Claim not found", code: 404 as const };
    if (claim.status !== "pending") {
      return { error: "Only pending claims can be confirmed", code: 409 as const };
    }
    if (claim.drop_status !== "live") {
      return { error: `Drop is ${claim.drop_status}; cannot confirm more claims`, code: 409 as const };
    }
    if (new Date(claim.expires_at).getTime() <= Date.now()) {
      await client.query(`UPDATE drops SET status = 'expired' WHERE id = $1`, [claim.drop_id]);
      await client.query(
        `UPDATE claims
         SET status = 'expired'
         WHERE drop_id = $1 AND status = 'pending'`,
        [claim.drop_id]
      );
      return { error: "Drop has expired", code: 409 as const };
    }

    const confirmedBeforeResult = await client.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count
       FROM claims
       WHERE drop_id = $1 AND status = 'confirmed'`,
      [claim.drop_id]
    );
    const confirmedBefore = confirmedBeforeResult.rows[0]?.count ?? 0;
    if (confirmedBefore >= claim.spots_available) {
      await client.query(
        `UPDATE drops
         SET status = 'filled'
         WHERE id = $1 AND status = 'live'`,
        [claim.drop_id]
      );
      return { error: "Drop is already filled", code: 409 as const };
    }

    await client.query(
      `UPDATE claims
       SET status = 'confirmed', confirmed_at = NOW()
       WHERE id = $1`,
      [req.params.id]
    );

    const confirmedCountResult = await client.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count
       FROM claims
       WHERE drop_id = $1 AND status = 'confirmed'`,
      [claim.drop_id]
    );
    const confirmedCount = confirmedCountResult.rows[0]?.count ?? 0;
    const justFilled = confirmedCount >= claim.spots_available;
    if (justFilled) {
      await client.query(
        `UPDATE drops
         SET status = 'filled'
         WHERE id = $1 AND status = 'live'`,
        [claim.drop_id]
      );
    }

    const updatedClaim = await client.query(`SELECT * FROM claims WHERE id = $1`, [req.params.id]);
    return {
      claim: updatedClaim.rows[0],
      dropId: claim.drop_id,
      justFilled,
      claimantName: claim.claimant_name,
    };
  });

  if ("error" in result) {
    res.status(result.code ?? 500).json({ error: result.error });
    return;
  }

  await emitOperatorEvent(req.operatorId!, "claim_confirmed", req.operatorBusinessName || "operator", {
    claim_id: req.params.id,
    drop_id: result.dropId,
    claimant_name: result.claimantName,
  });
  if (result.justFilled) {
    await emitOperatorEvent(req.operatorId!, "drop_filled", req.operatorBusinessName || "operator", {
      drop_id: result.dropId,
    });
  }

  res.json(result.claim);
}));

router.patch("/claims/:id/reject", requireOperator, safe(async (req: OperatorRequest, res: Response) => {
  const result = await query(
    `UPDATE claims c
     SET status = 'rejected'
     FROM drops d
     WHERE c.drop_id = d.id
       AND c.id = $1
       AND d.operator_id = $2
       AND c.status = 'pending'
     RETURNING c.*`,
    [req.params.id, req.operatorId!]
  );

  const rejected = result.rows[0];
  if (!rejected) {
    res.status(404).json({ error: "Pending claim not found" });
    return;
  }

  await emitOperatorEvent(req.operatorId!, "claim_rejected", req.operatorBusinessName || "operator", {
    claim_id: req.params.id,
    drop_id: rejected.drop_id as string,
  });
  res.json(rejected);
}));

// ═══════════════════════════════════════════════════════════
// RUSH LIST
// ═══════════════════════════════════════════════════════════

router.get("/rush-list", requireOperator, safe(async (req: OperatorRequest, res: Response) => {
  const members = await query(
    `SELECT * FROM rush_list_members
     WHERE operator_id = $1
     ORDER BY opted_in_at DESC`,
    [req.operatorId!]
  );
  res.json(members.rows);
}));

router.post("/rush-list", requireOperator, safe(async (req: OperatorRequest, res: Response) => {
  const { phone, name } = req.body ?? {};
  if (!phone || typeof phone !== "string") {
    res.status(400).json({ error: "phone is required" });
    return;
  }
  if (!name || typeof name !== "string") {
    res.status(400).json({ error: "name is required" });
    return;
  }

  const id = uuid();
  try {
    await query(
      `INSERT INTO rush_list_members (id, operator_id, phone, name)
       VALUES ($1, $2, $3, $4)`,
      [id, req.operatorId!, phone.trim(), name.trim()]
    );
  } catch (err: unknown) {
    const pgErr = err as { code?: string };
    if (pgErr.code === "23505") {
      res.status(409).json({ error: "Phone number already on rush list" });
      return;
    }
    throw err;
  }

  const created = await query(`SELECT * FROM rush_list_members WHERE id = $1`, [id]);
  res.status(201).json(created.rows[0]);
}));

router.delete("/rush-list/:id", requireOperator, safe(async (req: OperatorRequest, res: Response) => {
  const deleted = await query(
    `DELETE FROM rush_list_members WHERE id = $1 AND operator_id = $2`,
    [req.params.id, req.operatorId!]
  );
  if (deleted.rowCount === 0) {
    res.status(404).json({ error: "Rush list member not found" });
    return;
  }
  res.json({ ok: true });
}));

// ═══════════════════════════════════════════════════════════
// STATS
// ═══════════════════════════════════════════════════════════

router.get("/stats/today", requireOperator, safe(async (req: OperatorRequest, res: Response) => {
  const recovered = await query<{ recovered_revenue_cents: number }>(
    `SELECT COALESCE(SUM(d.price_cents), 0)::int AS recovered_revenue_cents
     FROM claims c
     JOIN drops d ON d.id = c.drop_id
     WHERE d.operator_id = $1
       AND c.status = 'confirmed'
       AND c.confirmed_at::date = CURRENT_DATE`,
    [req.operatorId!]
  );

  const dropsLaunched = await query<{ count: number }>(
    `SELECT COUNT(*)::int AS count
     FROM drops
     WHERE operator_id = $1
       AND launched_at::date = CURRENT_DATE`,
    [req.operatorId!]
  );

  const dropsFilled = await query<{ count: number }>(
    `SELECT COUNT(*)::int AS count
     FROM drops
     WHERE operator_id = $1
       AND status = 'filled'
       AND launched_at::date = CURRENT_DATE`,
    [req.operatorId!]
  );

  const claimsCount = await query<{ count: number }>(
    `SELECT COUNT(*)::int AS count
     FROM claims c
     JOIN drops d ON d.id = c.drop_id
     WHERE d.operator_id = $1
       AND c.claimed_at::date = CURRENT_DATE`,
    [req.operatorId!]
  );

  res.json({
    recovered_revenue_cents: recovered.rows[0]?.recovered_revenue_cents ?? 0,
    drops_launched: dropsLaunched.rows[0]?.count ?? 0,
    drops_filled: dropsFilled.rows[0]?.count ?? 0,
    claims_count: claimsCount.rows[0]?.count ?? 0,
  });
}));

router.get("/stats/history", requireOperator, safe(async (req: OperatorRequest, res: Response) => {
  const days = Math.max(1, Math.min(90, Number(req.query.days) || 7));
  const history = await query(
    `WITH days AS (
       SELECT (CURRENT_DATE - ($2::int - 1) + offs)::date AS day
       FROM generate_series(0, $2::int - 1) AS offs
     ),
     daily_drops AS (
       SELECT launched_at::date AS day,
              COUNT(*)::int AS drops_launched,
              COUNT(*) FILTER (WHERE status = 'filled')::int AS drops_filled
       FROM drops
       WHERE operator_id = $1
         AND launched_at::date >= CURRENT_DATE - ($2::int - 1)
       GROUP BY launched_at::date
     ),
     daily_revenue AS (
       SELECT c.confirmed_at::date AS day,
              COALESCE(SUM(d.price_cents), 0)::int AS recovered_revenue_cents
       FROM claims c
       JOIN drops d ON d.id = c.drop_id
       WHERE d.operator_id = $1
         AND c.status = 'confirmed'
         AND c.confirmed_at::date >= CURRENT_DATE - ($2::int - 1)
       GROUP BY c.confirmed_at::date
     )
     SELECT days.day,
            COALESCE(dd.drops_launched, 0) AS drops_launched,
            COALESCE(dd.drops_filled, 0) AS drops_filled,
            COALESCE(dr.recovered_revenue_cents, 0) AS recovered_revenue_cents
     FROM days
     LEFT JOIN daily_drops dd ON dd.day = days.day
     LEFT JOIN daily_revenue dr ON dr.day = days.day
     ORDER BY days.day ASC`,
    [req.operatorId!, days]
  );

  res.json(history.rows);
}));

export default router;
