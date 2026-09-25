import { NextResponse } from "next/server";
import { applicationSchema, fieldErrors } from "@/lib/validation";
import { getServerSupabase, getServiceSupabase } from "@/lib/supabase/server";
import { employerNewApplicationEmail, teenConfirmationEmail } from "@/lib/email/templates";
import { sendEmail } from "@/lib/email/send";
import { isDemoMode, SITE_URL } from "@/lib/config";

/**
 * POST /api/applications
 * Creates an application as the signed-in teen (RLS + triggers route it to the
 * job's employer), then sends the employer notification + teen confirmation emails.
 * No platform operator is involved.
 */
export async function POST(req: Request) {
  if (isDemoMode) return NextResponse.json({ error: "Demo mode handles applications in the browser." }, { status: 400 });
  const supabase = await getServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Please sign in to apply." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = applicationSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Please fix the highlighted fields.", fields: fieldErrors(parsed.error) }, { status: 422 });
  const v = parsed.data;
  const resume_path: string | null = typeof body?.resume_path === "string" && body.resume_path.startsWith(`${auth.user.id}/`) ? body.resume_path : null;
  const resume_name: string | null = resume_path ? String(body?.resume_name ?? "resume") : null;

  const row = {
    job_id: v.job_id,
    teen_id: auth.user.id,
    employer_id: auth.user.id, // placeholder — overwritten by trigger from the job
    applicant_name: v.applicant_name,
    applicant_email: v.applicant_email,
    applicant_phone: v.applicant_phone,
    age_range: v.age_range,
    city: v.city,
    experience: v.experience,
    skills: v.skills,
    availability: v.availability,
    transportation: v.transportation,
    interest_statement: v.interest_statement,
    portfolio_url: v.portfolio_url || null,
    work_permit_status: v.work_permit_status,
    guardian_consent_status: v.guardian_consent_status,
    agreed_to_safety_rules: true,
    resume_path,
    resume_name,
  };

  // Re-open a previously withdrawn application instead of creating a duplicate.
  const { data: existing } = await supabase.from("applications").select("id,status").eq("job_id", v.job_id).eq("teen_id", auth.user.id).maybeSingle();
  let result;
  if (existing && existing.status !== "withdrawn") {
    return NextResponse.json({ error: "You've already applied to this job. Check your dashboard for its status.", code: "duplicate" }, { status: 409 });
  } else if (existing) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { employer_id, ...update } = row;
    result = await supabase.from("applications").update({ ...update, status: "submitted" }).eq("id", existing.id).select().single();
  } else {
    result = await supabase.from("applications").insert(row).select().single();
  }
  if (result.error) {
    const dup = result.error.code === "23505";
    return NextResponse.json(
      { error: dup ? "You've already applied to this job." : result.error.message, code: dup ? "duplicate" : "db" },
      { status: dup ? 409 : 400 },
    );
  }
  const app = result.data;

  // Look up employer contact with the service role — only after the insert succeeded under RLS.
  const admin = getServiceSupabase();
  const { data: job } = await supabase.from("jobs").select("title, employer:employer_profiles(display_name)").eq("id", app.job_id).single();
  const jobTitle = job?.title ?? "your listing";
  const employerName = (job?.employer as unknown as { display_name: string } | null)?.display_name ?? "the employer";
  const first = v.applicant_name.split(" ")[0] ?? v.applicant_name;
  const emails: Promise<unknown>[] = [
    sendEmail(teenConfirmationEmail({ to: v.applicant_email, site: SITE_URL, teenFirstName: first, jobTitle, employerName })),
  ];
  if (admin) {
    const { data: emp } = await admin.from("users").select("email").eq("id", app.employer_id).single();
    if (emp?.email)
      emails.push(sendEmail(employerNewApplicationEmail({ to: emp.email, site: SITE_URL, employerName, jobTitle, applicantFirstName: first, applicationId: app.id })));
  } else {
    console.warn("SUPABASE_SERVICE_ROLE_KEY missing — employer email skipped (in-app notification still created).");
  }
  await Promise.allSettled(emails);

  return NextResponse.json({ application: app });
}
