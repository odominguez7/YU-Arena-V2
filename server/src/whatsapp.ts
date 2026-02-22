import { query } from "./db";

const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID || "";
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN || "";
const TWILIO_FROM = process.env.TWILIO_WHATSAPP_FROM || "";
const BASE_URL = process.env.BASE_URL || "http://localhost:5173";

interface RushMember {
  phone: string;
  name: string;
}

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(0)}`;
}

function buildClaimUrl(dropId: string): string {
  return `${BASE_URL}/claim/${dropId}`;
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

async function sendWhatsApp(to: string, body: string): Promise<boolean> {
  if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_FROM) return false;

  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`;
    const auth = Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString("base64");
    const params = new URLSearchParams({
      From: `whatsapp:${TWILIO_FROM}`,
      To: `whatsapp:${to}`,
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
    return res.ok;
  } catch (err) {
    console.error(`WhatsApp send failed for ${to}:`, err);
    return false;
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
    `SELECT phone, name FROM rush_list_members WHERE operator_id = $1`,
    [operatorId]
  );

  const total = members.rows.length;
  if (total === 0) return { sent: 0, total: 0 };

  if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_FROM) {
    console.log(
      `[WhatsApp] Twilio not configured. Would broadcast to ${total} members: ${buildMessage(title, priceCents, spots, dropId)}`
    );
    return { sent: 0, total };
  }

  const message = buildMessage(title, priceCents, spots, dropId);
  const results = await Promise.allSettled(
    members.rows.map((m) => sendWhatsApp(m.phone, message))
  );

  const sent = results.filter(
    (r) => r.status === "fulfilled" && r.value === true
  ).length;

  console.log(`[WhatsApp] Broadcast: ${sent}/${total} delivered for drop ${dropId}`);
  return { sent, total };
}
