import { NextResponse } from "next/server";
import { z } from "zod";
import { isDemoMode } from "@/lib/config";
import { standardizeAddress } from "@/lib/safety/address";
import { getServerSupabase, getServiceSupabase } from "@/lib/supabase/server";

const schema = z.object({
  id: z.string().uuid().optional(),
  line1: z.string().trim().min(3).max(120),
  line2: z.string().trim().max(60).optional().nullable(),
  city: z.string().trim().min(2).max(60),
  postal_code: z.string().trim().regex(/^\d{5}(-\d{4})?$/, "Enter a 5-digit ZIP code."),
});

/**
 * POST /api/verification/address — employer adds or edits a private service address.
 * Written under the employer's own session (RLS), then standardized when a provider is configured.
 * Any edit resets the review status. The address is never shown publicly.
 */
export async function POST(req: Request) {
  if (isDemoMode) return NextResponse.json({ error: "Addresses require the live backend." }, { status: 400 });
  const supabase = await getServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the address." }, { status: 422 });
  const { id, ...addr } = parsed.data;
  const row = { ...addr, line2: addr.line2 || null, state: "CA" };
  const q = id
    ? supabase.from("employer_addresses").update(row).eq("id", id).eq("employer_id", auth.user.id)
    : supabase.from("employer_addresses").insert({ ...row, employer_id: auth.user.id });
  const { data, error } = await q.select("id, status").single();
  if (error || !data) return NextResponse.json({ error: error?.message ?? "Address not found." }, { status: 400 });

  let standardization: "not_configured" | "deliverable" | "needs_review" | "unchanged" = "unchanged";
  if (data.status === "submitted") {
    const service = getServiceSupabase();
    const summary = await standardizeAddress(row);
    standardization = summary ? (summary.deliverable ? "deliverable" : "needs_review") : "not_configured";
    if (service) await service.rpc("service_set_address_standardized", { p_address: data.id, p_summary: summary });
  }
  return NextResponse.json({ ok: true, id: data.id, standardization });
}
