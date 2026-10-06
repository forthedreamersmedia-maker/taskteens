import { NextResponse } from "next/server";
import { isDemoMode } from "@/lib/config";
import { hashToken } from "@/lib/safety/tokens";
import { getServiceSupabase } from "@/lib/supabase/server";

/** GET /api/parent-invitations/preview?token= — minimal details for the invitation page. */
export async function GET(req: Request) {
  if (isDemoMode) return NextResponse.json({ error: "Parent invitations require the live backend." }, { status: 400 });
  const token = new URL(req.url).searchParams.get("token") ?? "";
  if (!/^[A-Za-z0-9_-]{30,80}$/.test(token)) return NextResponse.json({ error: "This invitation link is not valid." }, { status: 404 });
  const service = getServiceSupabase();
  if (!service) return NextResponse.json({ error: "Invitations are unavailable right now." }, { status: 503 });
  const { data } = await service.rpc("parent_invitation_preview", { p_token_hash: hashToken(token) });
  const row = (data as { teen_first_name: string; parent_name: string; parent_email: string; status: string; expires_at: string }[] | null)?.[0];
  if (!row) return NextResponse.json({ error: "This invitation link is not valid." }, { status: 404 });
  return NextResponse.json({ teenFirstName: row.teen_first_name, parentName: row.parent_name, parentEmail: row.parent_email, status: row.status, expiresAt: row.expires_at });
}
