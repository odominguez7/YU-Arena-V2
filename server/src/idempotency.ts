import { Request, Response, NextFunction } from "express";
import { query } from "./db";

/**
 * If the request includes an `Idempotency-Key` header and we've seen it before,
 * return the cached response instead of re-executing.
 */
export async function idempotency(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const key = req.headers["idempotency-key"] as string | undefined;
  if (!key) {
    next();
    return;
  }

  try {
    const found = await query<{ response: string }>(
      `SELECT response FROM idempotency_keys WHERE key = $1`,
      [key]
    );
    const cached = found.rows[0];
    if (cached) {
      const parsed = JSON.parse(cached.response);
      res.status(parsed.status).json(parsed.body);
      return;
    }
  } catch (err) {
    next(err);
    return;
  }

  const originalJson = res.json.bind(res);
  res.json = (body: unknown) => {
    query(
      `INSERT INTO idempotency_keys (key, response) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING`,
      [key, JSON.stringify({ status: res.statusCode, body })]
    ).catch(() => {
      // ignore duplicate key race or transient insert failure
    });
    return originalJson(body);
  };

  next();
}
