import { NextResponse } from "next/server";
import { reportSchema, fieldErrors } from "@/lib/validation";
import { getServerSupabase, getServiceSupabase } from "@/lib/supabase/server";
import { safetyReportEmail } from "@/lib/email/templates";
import { sendEmail } from "@/lib/email/send";
import { isDemoMode, SITE_URL } from "@/lib/config";
import { SAFETY_EMAIL } from "@/lib/constants";

async function verifyTurnstile(token: string | undefined, ip: string | null): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret) return true; // not configured — fall back to open reporting
  if (!token) return false;
  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set("remoteip", ip);
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
    const json = (await res.json()) as { success?: boolean };
    return !!json.success;
  } catch {
    return false;
  }
}

/** POST /api/reports — anyone can file a safety report. Signed-out reporters must pass the CAPTCHA. Urgent ones email the safety inbox. */
export async function POST(req: Request) {
  if (isDemoMode) return NextResponse.json({ error: "Demo mode handles reports in the browser." }, { status: 400 });
  const raw = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const parsed = reportSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "Please fix the highlighted fields.", fields: fieldErrors(parsed.error) }, { status: 422 });

  const supabase = await getServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  const signedIn = !!auth.user;

  if (!signedIn) {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    const ok = await verifyTurnstile(typeof raw?.captcha_token === "string" ? raw.captcha_token : undefined, ip);
    if (!ok) return NextResponse.json({ error: "Please complete the security check and try again.", code: "captcha" }, { status: 400 });
  }

  const id = crypto.randomUUID();
  const row = { id, ...parsed.data, contact_email: parsed.data.contact_email || null, reporter_id: auth.user?.id ?? null };
  // Signed-out reports are written with the server key (direct anonymous inserts are blocked in the database).
  const writer = signedIn ? supabase : getServiceSupabase();
  if (!writer) return NextResponse.json({ error: "Reporting is temporarily unavailable. Email " + SAFETY_EMAIL + "." }, { status: 503 });
  const { error } = await writer.from("reports").insert(row);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (parsed.data.severity !== "normal") {
    await sendEmail(safetyReportEmail({ to: process.env.SAFETY_INBOX || SAFETY_EMAIL, site: SITE_URL, severity: parsed.data.severity, reason: parsed.data.reason, details: parsed.data.details, reportId: id }));
  }
  return NextResponse.json({ id });
}
