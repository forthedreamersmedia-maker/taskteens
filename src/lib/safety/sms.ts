import "server-only";

/**
 * Twilio SMS (REST API, no SDK). Unavailable until TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and
 * TWILIO_FROM_NUMBER (or TWILIO_MESSAGING_SERVICE_SID) are set. Never pretends a message was sent.
 */
export function smsConfigured(): boolean {
  return !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && (process.env.TWILIO_FROM_NUMBER || process.env.TWILIO_MESSAGING_SERVICE_SID));
}

export type SmsResult = { status: "sent"; id: string } | { status: "skipped"; reason: string } | { status: "failed"; reason: string };

export async function sendSms(to: string, body: string): Promise<SmsResult> {
  if (!smsConfigured()) return { status: "skipped", reason: "SMS is not configured" };
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const form = new URLSearchParams({ To: to, Body: body });
  if (process.env.TWILIO_MESSAGING_SERVICE_SID) form.set("MessagingServiceSid", process.env.TWILIO_MESSAGING_SERVICE_SID);
  else form.set("From", process.env.TWILIO_FROM_NUMBER!);
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: { Authorization: `Basic ${Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64")}`, "content-type": "application/x-www-form-urlencoded" },
      body: form,
    });
    const j = (await res.json().catch(() => ({}))) as { sid?: string; message?: string };
    if (!res.ok || !j.sid) return { status: "failed", reason: j.message ?? `Twilio HTTP ${res.status}` };
    return { status: "sent", id: j.sid };
  } catch (e) {
    return { status: "failed", reason: e instanceof Error ? e.message : "network error" };
  }
}

/** Normalises a US phone number to E.164 (+1XXXXXXXXXX) or returns null. */
export function toE164(input: string): string | null {
  const d = input.replace(/\D/g, "");
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  return null;
}
