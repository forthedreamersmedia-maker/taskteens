import { after, NextResponse } from "next/server";
import { dispatchDue } from "@/lib/safety/dispatch";
import { z } from "zod";
import { isDemoMode } from "@/lib/config";
import { CONSENT_STATEMENTS, CONSENT_VERSION } from "@/lib/safety/consent";
import { clientIp, hashToken } from "@/lib/safety/tokens";
import { getServerSupabase, getServiceSupabase } from "@/lib/supabase/server";

const schema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{30,80}$/),
  statements: z.array(z.string()),
  allow_location: z.boolean(),
});

/**
 * POST /api/parent-invitations/accept — the signed-in parent gives consent.
 * Every statement must be confirmed. The consent version, statements, IP, user agent and parent ID are recorded.
 */
export async function POST(req: Request) {
  if (isDemoMode) return NextResponse.json({ error: "Parent invitations require the live backend." }, { status: 400 });
  const supabase = await getServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Please sign in with your parent account." }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 422 });
  const required = CONSENT_STATEMENTS.map((s) => s.id);
  if (!required.every((id) => parsed.data.statements.includes(id)))
    return NextResponse.json({ error: "Please confirm every statement to give consent." }, { status: 422 });

  const service = getServiceSupabase();
  if (!service) return NextResponse.json({ error: "Invitations are unavailable right now." }, { status: 503 });
  const statements = CONSENT_STATEMENTS.map((s) => ({ id: s.id, text: s.text }));
  if (parsed.data.allow_location) statements.push({ id: "location_sharing", text: "Allow optional live location sharing during confirmed jobs." });
  const { error } = await service.rpc("accept_parent_invitation", {
    p_token_hash: hashToken(parsed.data.token),
    p_parent: auth.user.id,
    p_consent_version: CONSENT_VERSION,
    p_statements: statements,
    p_ip: clientIp(req),
    p_user_agent: req.headers.get("user-agent") ?? null,
    p_allow_location: parsed.data.allow_location,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  { const svc = getServiceSupabase(); if (svc) after(() => dispatchDue(svc, 15).catch((e) => console.error("[dispatch]", e))); }
  return NextResponse.json({ ok: true });
}
