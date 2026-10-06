import { NextResponse } from "next/server";
import { z } from "zod";
import { isDemoMode } from "@/lib/config";
import { hashCode, mailCode } from "@/lib/safety/codes";
import { getServerSupabase, getServiceSupabase } from "@/lib/supabase/server";

const schema = z.object({ address_id: z.string().uuid() });

/**
 * POST /api/admin/address-code — an administrator (MFA session) creates a one-time code to mail
 * to an employer's service address. The code is shown once; only its hash is stored. Viewing the
 * address for mailing is audit-logged. (Automated mailing via Lob/PostGrid is a future option.)
 */
export async function POST(req: Request) {
  if (isDemoMode) return NextResponse.json({ error: "Requires the live backend." }, { status: 400 });
  const supabase = await getServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) return NextResponse.json({ error: "Administrators with two-step verification only." }, { status: 403 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 422 });

  const { data: rows, error: aErr } = await supabase.rpc("admin_get_address", { p_address: parsed.data.address_id, p_reason: "Mail address possession code" });
  const addr = (rows as { employer_id: string; line1: string; line2: string | null; city: string; state: string; postal_code: string; status: string }[] | null)?.[0];
  if (aErr || !addr) return NextResponse.json({ error: aErr?.message ?? "Address not found." }, { status: 404 });
  if (!["reviewed", "possession_confirmed"].includes(addr.status)) return NextResponse.json({ error: "Review the address before mailing a code." }, { status: 400 });

  const service = getServiceSupabase();
  if (!service) return NextResponse.json({ error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 503 });
  const code = mailCode();
  const { error } = await service.rpc("service_store_code", { p_user: addr.employer_id, p_purpose: "address_possession", p_target: parsed.data.address_id, p_hash: hashCode(addr.employer_id, code), p_ttl_minutes: 60 * 24 * 30, p_daily_limit: 3 });
  if (error) return NextResponse.json({ error: error.message }, { status: 429 });
  return NextResponse.json({ code, expiresInDays: 30, mailTo: { line1: addr.line1, line2: addr.line2, city: addr.city, state: addr.state, postal_code: addr.postal_code } });
}
