import { NextResponse } from "next/server";
import { z } from "zod";
import { isDemoMode } from "@/lib/config";
import { hashCode, numericCode } from "@/lib/safety/codes";
import { sendSms, smsConfigured, toE164 } from "@/lib/safety/sms";
import { getServerSupabase, getServiceSupabase } from "@/lib/supabase/server";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("send"), phone: z.string().min(7).max(25) }),
  z.object({ action: z.literal("save"), phone: z.string().min(7).max(25) }),
  z.object({ action: z.literal("confirm"), code: z.string().regex(/^\d{6}$/) }),
]);

/**
 * POST /api/verification/phone — employer or parent phone confirmation.
 *   send:    save the number and text a 6-digit code (requires Twilio)
 *   save:    save the number without SMS so an administrator can confirm it by phone call
 *   confirm: check the code
 */
export async function POST(req: Request) {
  if (isDemoMode) return NextResponse.json({ error: "Phone confirmation requires the live backend." }, { status: 400 });
  const supabase = await getServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const { data: me } = await supabase.from("users").select("role").eq("id", auth.user.id).single();
  if (!me || !["employer", "parent"].includes(me.role)) return NextResponse.json({ error: "Not available for this account." }, { status: 403 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Check the phone number or code." }, { status: 422 });
  const service = getServiceSupabase();
  if (!service) return NextResponse.json({ error: "Phone confirmation is unavailable: the server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 503 });

  if (parsed.data.action === "save" || parsed.data.action === "send") {
    const phone = toE164(parsed.data.phone);
    if (!phone) return NextResponse.json({ error: "Enter a 10-digit US phone number." }, { status: 422 });
    const { error: saveErr } = await service.rpc("service_set_pending_phone", { p_user: auth.user.id, p_phone: phone });
    if (saveErr) return NextResponse.json({ error: saveErr.message }, { status: 400 });
    if (parsed.data.action === "save") return NextResponse.json({ ok: true, sms: "not_requested" });
    if (!smsConfigured()) return NextResponse.json({ error: "Text-message codes aren't available yet. Your number was saved — a TaskTeens administrator will call to confirm it.", code: "sms_unavailable" }, { status: 503 });
    const code = numericCode();
    const { error } = await service.rpc("service_store_code", { p_user: auth.user.id, p_purpose: "phone", p_target: phone, p_hash: hashCode(auth.user.id, code), p_ttl_minutes: 10, p_daily_limit: 5 });
    if (error) return NextResponse.json({ error: error.message }, { status: 429 });
    const sent = await sendSms(phone, `TaskTeens code: ${code}. It expires in 10 minutes. Don't share it with anyone.`);
    if (sent.status !== "sent") return NextResponse.json({ error: `The text message could not be sent (${sent.reason}). Try again later.`, code: "sms_failed" }, { status: 502 });
    return NextResponse.json({ ok: true, sms: "sent" });
  }

  const table = me.role === "employer" ? "employer_profiles" : "parent_profiles";
  const { data: prof } = await supabase.from(table).select("phone_e164").eq("user_id", auth.user.id).single();
  const phone = (prof as { phone_e164: string | null } | null)?.phone_e164;
  if (!phone) return NextResponse.json({ error: "Request a code first." }, { status: 400 });
  const { data: result, error } = await service.rpc("service_check_code", { p_user: auth.user.id, p_purpose: "phone", p_target: phone, p_hash: hashCode(auth.user.id, parsed.data.code) });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (result !== "ok") {
    const msg = result === "wrong" ? "That code isn't right." : result === "locked" ? "Too many wrong attempts. Request a new code." : "That code expired. Request a new one.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  const { error: cErr } = await service.rpc("service_confirm_phone", { p_user: auth.user.id, p_phone: phone, p_method: "sms_otp" });
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
