import { after, NextResponse } from "next/server";
import { dispatchDue } from "@/lib/safety/dispatch";
import { z } from "zod";
import { getServerSupabase, getServiceSupabase } from "@/lib/supabase/server";
import { statusUpdateEmail } from "@/lib/email/templates";
import { sendEmail } from "@/lib/email/send";
import { isDemoMode, SITE_URL } from "@/lib/config";

const schema = z.object({
  status: z.enum(["viewed", "interview_requested", "selected", "not_selected", "submitted", "cancelled"]),
  message: z.string().max(1000).optional(),
});

/**
 * POST /api/applications/:id/status — employer updates an application's status.
 * RLS guarantees the caller owns the listing; the DB trigger creates the in-app
 * notification; this route sends the email.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (isDemoMode) return NextResponse.json({ error: "Demo mode handles this in the browser." }, { status: 400 });
  const { id } = await ctx.params;
  const supabase = await getServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid status." }, { status: 422 });

  const { data: app, error } = await supabase
    .from("applications")
    .update({ status: parsed.data.status })
    .eq("id", id)
    .eq("employer_id", auth.user.id)
    .select("id, applicant_name, teen_id, job:jobs(title), employer:employer_profiles(display_name)")
    .single();
  if (error || !app) return NextResponse.json({ error: error?.message ?? "Application not found." }, { status: 404 });

  // An optional note goes through moderated TaskTeens messaging (visible to the teen's parent),
  // never straight into an email.
  let messageHeld = false;
  if (parsed.data.message?.trim()) {
    const { data: conv } = await supabase.from("conversations").select("id").eq("application_id", id).maybeSingle();
    if (conv) {
      const { data: sent, error: msgErr } = await supabase.rpc("send_message", { p_conversation: conv.id, p_body: parsed.data.message.trim() });
      if (msgErr) console.warn("status note not sent:", msgErr.message);
      messageHeld = !!(sent as { held?: boolean } | null)?.held;
    }
  }

  if (parsed.data.status !== "viewed") {
    // Employers can't read teen accounts under RLS, so look up the email + opt-out with the service role.
    const service = getServiceSupabase();
    const [{ data: prefs }, { data: teen }] = service
      ? await Promise.all([
          service.from("teen_profiles").select("email_notifications").eq("user_id", app.teen_id).maybeSingle(),
          service.from("users").select("email").eq("id", app.teen_id).maybeSingle(),
        ])
      : [{ data: null }, { data: null }];
    if (prefs?.email_notifications !== false && teen?.email) {
      await sendEmail(
        statusUpdateEmail({
          to: teen.email,
          site: SITE_URL,
          teenFirstName: app.applicant_name.split(" ")[0] ?? app.applicant_name,
          jobTitle: (app.job as unknown as { title: string })?.title ?? "",
          employerName: (app.employer as unknown as { display_name: string })?.display_name ?? "",
          status: parsed.data.status,
          message: undefined,
        }),
      );
    }
  }
  { const svc = getServiceSupabase(); if (svc) after(() => dispatchDue(svc, 15).catch((e) => console.error("[dispatch]", e))); }
  return NextResponse.json({ ok: true, messageHeld });
}
