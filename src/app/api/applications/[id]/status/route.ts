import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSupabase, getServiceSupabase } from "@/lib/supabase/server";
import { statusUpdateEmail } from "@/lib/email/templates";
import { sendEmail } from "@/lib/email/send";
import { isDemoMode, SITE_URL } from "@/lib/config";

const schema = z.object({
  status: z.enum(["viewed", "interview_requested", "selected", "not_selected", "submitted"]),
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
    .select("id, applicant_name, applicant_email, teen_id, job:jobs(title), employer:employer_profiles(display_name)")
    .single();
  if (error || !app) return NextResponse.json({ error: error?.message ?? "Application not found." }, { status: 404 });

  if (parsed.data.status !== "viewed") {
    // Employers can't read teen profiles under RLS, so check the opt-out with the service role.
    const service = getServiceSupabase();
    const { data: prefs } = service
      ? await service.from("teen_profiles").select("email_notifications").eq("user_id", app.teen_id).maybeSingle()
      : { data: null };
    if (prefs?.email_notifications !== false) {
      await sendEmail(
        statusUpdateEmail({
          to: app.applicant_email,
          site: SITE_URL,
          teenFirstName: app.applicant_name.split(" ")[0] ?? app.applicant_name,
          jobTitle: (app.job as unknown as { title: string })?.title ?? "",
          employerName: (app.employer as unknown as { display_name: string })?.display_name ?? "",
          status: parsed.data.status,
          message: parsed.data.message,
        }),
      );
    }
  }
  return NextResponse.json({ ok: true });
}
