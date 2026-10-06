import { NextResponse } from "next/server";
import { z } from "zod";
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
}
