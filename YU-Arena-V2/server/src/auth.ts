import { Request, Response, NextFunction } from "express";
import jwt, { type SignOptions } from "jsonwebtoken";
import { hashKey, query } from "./db";

const JWT_SECRET = process.env.JWT_SECRET || "yu-arena-dev-secret-change-in-prod";
const JWT_EXPIRY_SECONDS = parseInt(process.env.JWT_EXPIRY_SECONDS || "86400", 10); // 24h default
const ADMIN_KEY = process.env.ADMIN_API_KEY || "";

// ─── Types ───────────────────────────────────────────────

export interface OperatorJwtPayload {
  operatorId: string;
  businessName: string;
}

export interface OperatorRequest extends Request {
  operatorId?: string;
  operatorBusinessName?: string;
}

/** Legacy: kept for old agent-based routes until they're migrated */
export interface AuthenticatedRequest extends Request {
  agentName?: string;
  agentId?: string;
}

// ─── JWT helpers ─────────────────────────────────────────

export function signOperatorToken(payload: OperatorJwtPayload): string {
  const opts: SignOptions = { expiresIn: JWT_EXPIRY_SECONDS };
  return jwt.sign(payload, JWT_SECRET, opts);
}

export function verifyOperatorToken(token: string): OperatorJwtPayload {
  return jwt.verify(token, JWT_SECRET) as OperatorJwtPayload;
}

// ─── Login handler ───────────────────────────────────────

export async function loginHandler(req: Request, res: Response): Promise<void> {
  const { access_code } = req.body;

  if (!access_code || typeof access_code !== "string") {
    res.status(400).json({ error: "access_code is required" });
    return;
  }

  const codeHash = hashKey(access_code.trim());

  const result = await query<{ id: string; business_name: string }>(
    `SELECT id, business_name FROM operators WHERE access_code_hash = $1`,
    [codeHash]
  );

  const operator = result.rows[0];
  if (!operator) {
    res.status(401).json({ error: "Invalid access code" });
    return;
  }

  const token = signOperatorToken({
    operatorId: operator.id,
    businessName: operator.business_name,
  });

  res.json({
    token,
    operator: {
      id: operator.id,
      business_name: operator.business_name,
    },
  });
}

// ─── Operator middleware ─────────────────────────────────

export async function requireOperator(
  req: OperatorRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid Authorization header. Use: Bearer <token>" });
    return;
  }

  try {
    const token = header.slice(7);
    const payload = verifyOperatorToken(token);

    const result = await query<{ id: string }>(
      `SELECT id FROM operators WHERE id = $1`,
      [payload.operatorId]
    );

    if (result.rows.length === 0) {
      res.status(401).json({ error: "Operator no longer exists" });
      return;
    }

    req.operatorId = payload.operatorId;
    req.operatorBusinessName = payload.businessName;
    next();
  } catch (err) {
    if (err instanceof jwt.JsonWebTokenError) {
      res.status(401).json({ error: "Invalid or expired token" });
      return;
    }
    next(err);
  }
}

// ─── Legacy middleware (kept for old agent routes) ───────

export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid Authorization header. Use: Bearer <api_key>" });
    return;
  }

  try {
    const key = header.slice(7);
    const hash = hashKey(key);
    const result = await query<{ id: string; name: string }>(
      `SELECT id, name FROM agents WHERE api_key_hash = $1`,
      [hash]
    );
    const agent = result.rows[0];

    if (!agent) {
      res.status(403).json({ error: "Invalid API key" });
      return;
    }

    req.agentName = agent.name;
    req.agentId = agent.id;
    next();
  } catch (err) {
    next(err);
  }
}

export async function optionalAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const header = req.headers.authorization;
  if (!header) {
    req.agentName = "human";
    next();
    return;
  }

  await requireAuth(req, res, next);
}

export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid Authorization header. Use: Bearer <api_key>" });
    return;
  }

  const key = header.slice(7);
  if (!ADMIN_KEY || key !== ADMIN_KEY) {
    res.status(403).json({ error: "Invalid admin API key" });
    return;
  }

  next();
}
