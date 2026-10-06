import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SITE_URL } from "@/lib/config";
import { sendEmail } from "@/lib/email/send";
import { notificationEmail } from "@/lib/email/templates";
import { sendSms } from "./sms";

interface Claimed {
  id: string; channel: "email" | "sms"; attempts: number; user_id: string; email: string | null; phone: string | null;
  kind: string | null; title: string | null; body: string | null; link: string | null; priority: string | null;
}

const SAFETY_KINDS = new Set(["emergency", "safety_alert", "missed_checkin", "incident", "restriction", "contact_flag", "consent_revoked", "parent_approval", "parent_invitation"]);

/**
 * Sends due notification deliveries (email via Resend, SMS via Twilio) and records each outcome.
 * Failed sends are retried by the database with backoff; nothing is reported as sent unless the provider accepted it.
 */
export async function dispatchDue(service: SupabaseClient, limit = 25): Promise<{ sent: number; failed: number; skipped: number }> {
  const { data, error } = await service.rpc("claim_deliveries", { p_limit: limit });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Claimed[];
  const out = { sent: 0, failed: 0, skipped: 0 };

  // Teens can opt out of non-safety emails.
  const teenIds = [...new Set(rows.filter((r) => r.channel === "email").map((r) => r.user_id))];
  const optedOut = new Set<string>();
  if (teenIds.length) {
    const { data: prefs } = await service.from("teen_profiles").select("user_id,email_notifications").in("user_id", teenIds);
    for (const p of prefs ?? []) if (p.email_notifications === false) optedOut.add(p.user_id as string);
  }

  await Promise.all(rows.map(async (r) => {
    let status: "sent" | "failed" | "skipped" = "failed";
    let providerId: string | null = null;
    let errMsg: string | null = null;
    if (r.channel === "email") {
      if (!r.email) { status = "skipped"; errMsg = "No email address"; }
      else if (optedOut.has(r.user_id) && !SAFETY_KINDS.has(r.kind ?? "")) { status = "skipped"; errMsg = "User turned off email notifications"; }
      else {
        const res = await sendEmail(notificationEmail({ to: r.email, site: SITE_URL, title: r.title ?? "TaskTeens update", body: r.body ?? "", link: r.link, priority: r.priority ?? "normal" }));
        status = res === "resend" ? "sent" : res === "skipped" ? "skipped" : "failed";
        if (res === "skipped") errMsg = "Email is not configured (RESEND_API_KEY / EMAIL_FROM)";
        if (res === "failed") errMsg = "Email provider rejected the message";
      }
    } else {
      if (!r.phone) { status = "skipped"; errMsg = "No confirmed phone number"; }
      else {
        const res = await sendSms(r.phone, `TaskTeens: ${r.title ?? "Update"}. ${r.body ?? ""} ${SITE_URL}${r.link ?? "/dashboard"}`.slice(0, 600));
        status = res.status;
        if (res.status === "sent") providerId = res.id; else errMsg = res.reason;
      }
    }
    out[status]++;
    await service.rpc("complete_delivery", { p_id: r.id, p_status: status, p_provider_id: providerId, p_error: errMsg });
  }));
  return out;
}
