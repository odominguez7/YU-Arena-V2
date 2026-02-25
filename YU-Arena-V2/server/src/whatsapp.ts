import { query } from "./db";

const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID || "";
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN || "";
const TWILIO_FROM = process.env.TWILIO_WHATSAPP_FROM || "";
const BASE_URL = process.env.BASE_URL || "https://yu-arena-381932264033.us-east1.run.app";

export function isWhatsAppConfigured(): boolean {
  return !!(TWILIO_SID && TWILIO_TOKEN && TWILIO_FROM);
}

/** For status endpoint: show configured from number (not sensitive) so user can verify sandbox. */
export function getWhatsAppFromNumber(): string | null {
  if (!TWILIO_FROM?.trim()) return null;
  return normalizePhone(TWILIO_FROM.trim());
}

interface RushMember {
  phone: string;
  name: string;
}

/** Normalize phone to E.164 for comparison and Twilio. Exported for claim validation. */
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 0) return "";
  if (digits.length === 10 && digits[0] !== "1") return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return `+${digits}`;
}

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(0)}`;
}

function buildClaimUrl(dropId: string): string {
  return `${BASE_URL.replace(/\/+$/, "")}/claim/${dropId}`;
}

function buildMessage(
  title: string,
  priceCents: number,
  spots: number,
  dropId: string
): string {
  const price = formatPrice(priceCents);
  const spotWord = spots === 1 ? "spot" : "spots";
  const link = buildClaimUrl(dropId);
  return `🔥 Open ${spotWord}: ${title} — ${price} — ${spots} ${spotWord} — Claim now: ${link}`;
}

const TWILIO_ERROR_HINTS: Record<number, string> = {
  63015: "Recipient must join the WhatsApp sandbox first. From WhatsApp, send 'join <your-code>' to the sandbox number (+14155238886).",
  21608: "Recipient must join the WhatsApp sandbox first.",
  21211: "Invalid 'To' phone number. Use E.164 format (e.g. +16178720742).",
  20003: "Invalid Twilio credentials. Check TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.",
  21614: "The 'From' number is not a valid WhatsApp-enabled number. Use your sandbox number (+14155238886).",
};

async function sendWhatsAppOnce(to: string, body: string): Promise<{ ok: boolean; error?: string }> {
  if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_FROM) {
    return { ok: false, error: "Twilio not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM in Cloud Run." };
  }

  const toE164 = normalizePhone(to.trim());
  const fromE164 = normalizePhone(TWILIO_FROM.trim());

  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`;
  const auth = Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString("base64");
  const params = new URLSearchParams({
    From: `whatsapp:${fromE164}`,
    To: `whatsapp:${toE164}`,
    Body: body,
  });

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  const resText = await res.text();
  if (!res.ok) {
    let errMsg = `Twilio API error (${res.status})`;
    try {
      const errJson = JSON.parse(resText) as { code?: number; message?: string };
      const code = errJson.code ?? 0;
      errMsg = TWILIO_ERROR_HINTS[code] ?? errJson.message ?? errMsg;
      if (code && !TWILIO_ERROR_HINTS[code]) errMsg += ` [Twilio code ${code}]`;
    } catch {
      errMsg = resText || errMsg;
    }
    console.error(`[WhatsApp] Twilio error for ${toE164}:`, errMsg);
    return { ok: false, error: errMsg };
  }
  return { ok: true };
}

/** Send with one retry on failure. Returns ok for broadcast counting. */
async function sendWhatsApp(to: string, body: string): Promise<boolean> {
  try {
    const r1 = await sendWhatsAppOnce(to, body);
    if (r1.ok) return true;
    await new Promise((r) => setTimeout(r, 2000));
    const r2 = await sendWhatsAppOnce(to, body);
    return r2.ok;
  } catch (err) {
    const toE164 = normalizePhone(to.trim());
    console.error(`[WhatsApp] Send failed for ${toE164}:`, err);
    await new Promise((r) => setTimeout(r, 2000));
    try {
      const r3 = await sendWhatsAppOnce(to, body);
      return r3.ok;
    } catch (retryErr) {
      console.error(`[WhatsApp] Retry failed for ${toE164}:`, retryErr);
      return false;
    }
  }
}

export async function broadcastDrop(
  operatorId: string,
  dropId: string,
  title: string,
  priceCents: number,
  spots: number
): Promise<{ sent: number; total: number }> {
  const members = await query<RushMember>(
    `SELECT phone, name FROM rush_list_members WHERE operator_id = $1 ORDER BY opted_in_at ASC`,
    [operatorId]
  );

  const total = members.rows.length;
  if (total === 0) return { sent: 0, total: 0 };

  if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_FROM) {
    console.warn(
      `[WhatsApp] Twilio not configured — no messages sent. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM (and BASE_URL for claim links). Would have broadcast to ${total} members.`
    );
    return { sent: 0, total };
  }

  const message = buildMessage(title, priceCents, spots, dropId);
  console.log(`[WhatsApp] Broadcasting drop "${title}" to ${total} rush list members: ${members.rows.map((m) => `${m.name} (${m.phone})`).join(", ")}`);

  // Send to first member FIRST (with retry) to maximize chance of at least one delivery
  let sent = 0;
  const first = members.rows[0];
  const firstOk = await sendWhatsApp(first.phone, message);
  if (firstOk) sent++;
  console.log(`[WhatsApp] ${normalizePhone(first.phone.trim())} (${first.name}): ${firstOk ? "sent" : "failed"}`);

  // Send to rest in parallel
  const rest = members.rows.slice(1);
  const restResults = await Promise.allSettled(rest.map((m) => sendWhatsApp(m.phone, message)));
  rest.forEach((m, i) => {
    const r = restResults[i];
    const ok = r.status === "fulfilled" && r.value === true;
    if (ok) sent++;
    console.log(`[WhatsApp] ${normalizePhone(m.phone.trim())} (${m.name}): ${ok ? "sent" : "failed"}`);
  });

  const failed = total - sent;
  if (sent === 0) {
    console.error(
      `[WhatsApp] CRITICAL: 0/${total} delivered for drop ${dropId}. Check Twilio credentials, sandbox (recipients must "join"), and BASE_URL.`
    );
  } else if (failed > 0) {
    console.warn(`[WhatsApp] Broadcast: ${sent}/${total} delivered for drop ${dropId}.`);
  } else {
    console.log(`[WhatsApp] Broadcast: ${sent}/${total} delivered for drop ${dropId}`);
  }
  return { sent, total };
}

/** Send a test message to a single number. Returns { ok, error? } for debugging. */
export async function sendTestToNumber(operatorId: string, phone: string): Promise<{ ok: boolean; error?: string }> {
  const message = `🧪 YU Arena test — If you got this, WhatsApp is working! Reply to confirm.`;
  try {
    const result = await sendWhatsAppOnce(phone, message);
    if (result.ok) return { ok: true };
    const r2 = await sendWhatsAppOnce(phone, message);
    return r2.ok ? { ok: true } : { ok: false, error: r2.error ?? "Twilio API error" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}
