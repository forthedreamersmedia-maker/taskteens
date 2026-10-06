import { NextResponse } from "next/server";
import { z } from "zod";
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
}
