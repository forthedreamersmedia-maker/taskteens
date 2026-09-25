import { NextResponse } from "next/server";
import { reportSchema, fieldErrors } from "@/lib/validation";
import { getServerSupabase } from "@/lib/supabase/server";
import { safetyReportEmail } from "@/lib/email/templates";
import { sendEmail } from "@/lib/email/send";
import { isDemoMode, SITE_URL } from "@/lib/config";
import { SAFETY_EMAIL } from "@/lib/constants";

/** POST /api/reports — anyone (signed in or not) can file a safety report. Urgent ones email the safety inbox. */
export async function POST(req: Request) {
  if (isDemoMode) return NextResponse.json({ error: "Demo mode handles reports in the browser." }, { status: 400 });
  const parsed = reportSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Please fix the highlighted fields.", fields: fieldErrors(parsed.error) }, { status: 422 });
  const supabase = await getServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  const id = crypto.randomUUID();
  const { error } = await supabase.from("reports").insert({ id, ...parsed.data, contact_email: parsed.data.contact_email || null, reporter_id: auth.user?.id ?? null });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (parsed.data.severity !== "normal") {
    await sendEmail(safetyReportEmail({ to: process.env.SAFETY_INBOX || SAFETY_EMAIL, site: SITE_URL, severity: parsed.data.severity, reason: parsed.data.reason, details: parsed.data.details, reportId: id }));
  }
  return NextResponse.json({ id });
}
