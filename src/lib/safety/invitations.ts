import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SITE_URL } from "@/lib/config";
import { sendEmail } from "@/lib/email/send";
import { parentInvitationEmail } from "@/lib/email/templates";
import { newToken } from "./tokens";

export type InviteResult = { ok: true; email: "sent" | "failed" | "skipped" } | { ok: false; error: string };

/** Creates a parent invitation (service role) and emails it. Reports truthfully whether the email went out. */
export async function createAndSendInvitation(service: SupabaseClient, p: { teenId: string; teenFullName: string; parentName: string; parentEmail: string; parentPhone: string | null }): Promise<InviteResult> {
  const { token, hash } = newToken();
  const { data: id, error } = await service.rpc("create_parent_invitation", {
    p_teen: p.teenId, p_name: p.parentName, p_email: p.parentEmail, p_phone: p.parentPhone, p_token_hash: hash,
  });
  if (error) return { ok: false, error: error.message };
  const teenFirst = (p.teenFullName || "Your teen").split(" ")[0]!;
  const expires = new Date(Date.now() + 7 * 864e5).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "America/Los_Angeles" });
  const url = `${SITE_URL}/invite/parent?token=${token}`;
  const result = await sendEmail(parentInvitationEmail({ to: p.parentEmail, site: SITE_URL, parentName: p.parentName, teenFirstName: teenFirst, url, expires }));
  const status = result === "resend" ? "sent" : result;
  await service.rpc("record_invitation_email", {
    p_invitation: id, p_status: status,
    p_error: result === "failed" ? "Email provider rejected the message" : result === "skipped" ? "Email is not configured (RESEND_API_KEY / EMAIL_FROM)" : null,
  });
  return { ok: true, email: status };
}

/**
 * Sends the first invitation automatically using the parent details the teen gave at sign-up —
 * only once the teen has a confirmed email (so sign-up bots can't use it to email strangers),
 * and only if no invitation exists yet.
 */
export async function autoInviteFromSignup(service: SupabaseClient, userId: string): Promise<InviteResult | null> {
  const { data: au } = await service.auth.admin.getUserById(userId);
  if (!au?.user?.email_confirmed_at) return null;
  const { data: u } = await service.from("users").select("role, full_name").eq("id", userId).maybeSingle();
  if (u?.role !== "teen") return null;
  const { data: t } = await service.from("teen_profiles").select("parent_name, parent_email, parent_phone").eq("user_id", userId).maybeSingle();
  if (!t?.parent_email || !t.parent_name) return null;
  const { count } = await service.from("parent_invitations").select("id", { count: "exact", head: true }).eq("teen_id", userId);
  if ((count ?? 0) > 0) return null;
  return createAndSendInvitation(service, { teenId: userId, teenFullName: u.full_name, parentName: t.parent_name, parentEmail: t.parent_email, parentPhone: t.parent_phone });
}
