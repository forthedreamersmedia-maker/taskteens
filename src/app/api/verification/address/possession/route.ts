import { NextResponse } from "next/server";
import { z } from "zod";
import { isDemoMode } from "@/lib/config";
import { hashCode } from "@/lib/safety/codes";
import { getServerSupabase, getServiceSupabase } from "@/lib/supabase/server";

const schema = z.object({ address_id: z.string().uuid(), code: z.string().trim().min(6).max(12) });

/** POST — the employer enters the code that TaskTeens mailed to their service address. */
export async function POST(req: Request) {
  if (isDemoMode) return NextResponse.json({ error: "Requires the live backend." }, { status: 400 });
  const supabase = await getServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter the code from the mailed card." }, { status: 422 });
  const { data: own } = await supabase.from("employer_addresses").select("id").eq("id", parsed.data.address_id).maybeSingle();
  if (!own) return NextResponse.json({ error: "Address not found." }, { status: 404 });
  const service = getServiceSupabase();
  if (!service) return NextResponse.json({ error: "Unavailable right now." }, { status: 503 });
  const { data: result, error } = await service.rpc("service_check_code", { p_user: auth.user.id, p_purpose: "address_possession", p_target: parsed.data.address_id, p_hash: hashCode(auth.user.id, parsed.data.code) });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (result !== "ok") return NextResponse.json({ error: result === "wrong" ? "That code isn't right." : result === "locked" ? "Too many wrong attempts. Contact TaskTeens for a new card." : "That code expired. Contact TaskTeens for a new card." }, { status: 400 });
  const { error: cErr } = await service.rpc("service_confirm_address_possession", { p_address: parsed.data.address_id });
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
