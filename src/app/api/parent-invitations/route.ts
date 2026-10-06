import { NextResponse } from "next/server";
import { z } from "zod";
<<<<<<< HEAD
import { isDemoMode } from "@/lib/config";
import { autoInviteFromSignup, createAndSendInvitation } from "@/lib/safety/invitations";
import { toE164 } from "@/lib/safety/sms";
import { getServerSupabase, getServiceSupabase } from "@/lib/supabase/server";

const schema = z.union([
  z.object({ auto: z.literal(true) }),
  z.object({
    parent_name: z.string().trim().min(2, "Enter your parent or guardian's name.").max(80),
    parent_email: z.string().trim().email("Enter a valid email address."),
    parent_phone: z.string().trim().max(25).optional().nullable(),
  }),
]);

/**
 * POST /api/parent-invitations — the signed-in teen invites a parent/guardian.
 *   { auto: true } sends the first invitation from the details given at sign-up (if not sent yet).
=======
import { isDemoMode, SITE_URL } from "@/lib/config";
import { sendEmail } from "@/lib/email/send";
import { parentInvitationEmail } from "@/lib/email/templates";
import { newToken } from "@/lib/safety/tokens";
import { getServerSupabase, getServiceSupabase } from "@/lib/supabase/server";

const schema = z.object({
  parent_name: z.string().trim().min(2, "Enter your parent or guardian's name.").max(80),
  parent_email: z.string().trim().email("Enter a valid email address."),
});

/**
 * POST /api/parent-invitations — the signed-in teen invites a parent/guardian.
>>>>>>> 3e1cd4106bc8ed94a84e04cc9b624fcfd5c621d7
 * The database enforces: teen accounts only, not the teen's own email, max 3 per day.
 * Reports truthfully whether the email was actually sent.
 */
export async function POST(req: Request) {
  if (isDemoMode) return NextResponse.json({ error: "Parent invitations require the live backend." }, { status: 400 });
  const supabase = await getServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the form." }, { status: 422 });
<<<<<<< HEAD
  const service = getServiceSupabase();
  if (!service) return NextResponse.json({ error: "Parent invitations are unavailable: the server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 503 });

  if ("auto" in parsed.data) {
    const r = await autoInviteFromSignup(service, auth.user.id);
    if (!r) return NextResponse.json({ ok: true, email: "not_needed" });
    return r.ok ? NextResponse.json(r) : NextResponse.json({ error: r.error }, { status: 400 });
  }

  const phone = parsed.data.parent_phone ? toE164(parsed.data.parent_phone) : null;
  if (parsed.data.parent_phone && !phone) return NextResponse.json({ error: "Enter a 10-digit US phone number for your parent or guardian." }, { status: 422 });
  const { data: me } = await supabase.from("users").select("full_name").eq("id", auth.user.id).single();
  const r = await createAndSendInvitation(service, { teenId: auth.user.id, teenFullName: me?.full_name ?? "", parentName: parsed.data.parent_name, parentEmail: parsed.data.parent_email, parentPhone: phone });
  return r.ok ? NextResponse.json(r) : NextResponse.json({ error: r.error }, { status: 400 });
=======

  const service = getServiceSupabase();
  if (!service) return NextResponse.json({ error: "Parent invitations are unavailable: the server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 503 });

  const { token, hash } = newToken();
  const { data: id, error } = await service.rpc("create_parent_invitation", {
    p_teen: auth.user.id, p_name: parsed.data.parent_name, p_email: parsed.data.parent_email, p_token_hash: hash,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const { data: me } = await supabase.from("users").select("full_name").eq("id", auth.user.id).single();
  const teenFirst = (me?.full_name ?? "Your teen").split(" ")[0]!;
  const expires = new Date(Date.now() + 7 * 864e5).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "America/Los_Angeles" });
  const url = `${SITE_URL}/invite/parent?token=${token}`;
  const result = await sendEmail(parentInvitationEmail({ to: parsed.data.parent_email, site: SITE_URL, parentName: parsed.data.parent_name, teenFirstName: teenFirst, url, expires }));
  const status = result === "resend" ? "sent" : result;
  await service.rpc("record_invitation_email", { p_invitation: id, p_status: status, p_error: result === "failed" ? "Email provider rejected the message" : result === "skipped" ? "Email is not configured (RESEND_API_KEY / EMAIL_FROM)" : null });

  return NextResponse.json({ ok: true, email: status });
>>>>>>> 3e1cd4106bc8ed94a84e04cc9b624fcfd5c621d7
}
