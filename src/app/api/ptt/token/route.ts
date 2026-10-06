import { NextResponse } from "next/server";
import { AccessToken, TrackSource } from "livekit-server-sdk";
import { z } from "zod";
import { isDemoMode, LIVEKIT_URL } from "@/lib/config";
import { getServerSupabase } from "@/lib/supabase/server";

const schema = z.object({ teen_id: z.string().uuid() });

/**
 * POST /api/ptt/token — LiveKit access token for teen ↔ parent push-to-talk.
 * Only the teen and their linked parents can join, only around a confirmed job, audio only.
 * TaskTeens does not record or store audio (no LiveKit egress is configured).
 */
export async function POST(req: Request) {
  if (isDemoMode) return NextResponse.json({ error: "Requires the live backend." }, { status: 400 });
  const key = process.env.LIVEKIT_API_KEY, secret = process.env.LIVEKIT_API_SECRET;
  if (!LIVEKIT_URL || !key || !secret) return NextResponse.json({ error: "Push-to-talk isn't set up yet. Use Call instead.", code: "ptt_unavailable" }, { status: 503 });
  const supabase = await getServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 422 });
  const teenId = parsed.data.teen_id;

  const { data: me } = await supabase.from("users").select("role, full_name").eq("id", auth.user.id).single();
  let allowed = false;
  if (me?.role === "teen" && auth.user.id === teenId) allowed = true;
  if (me?.role === "parent") {
    const { data: link } = await supabase.from("parent_teen_links").select("id").eq("parent_id", auth.user.id).eq("teen_id", teenId).eq("status", "active").maybeSingle();
    allowed = !!link;
  }
  if (!allowed) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  // Only around a confirmed job (or during an open safety alert).
  const { data: jobs } = await supabase.rpc("active_jobs");
  const nearJob = ((jobs ?? []) as { teen_id: string; window_open: boolean; open_alert_id: string | null }[]).some((j) => j.teen_id === teenId && (j.window_open || j.open_alert_id));
  const { data: alerts } = await supabase.from("safety_alerts").select("id").eq("teen_id", teenId).eq("status", "open").limit(1);
  if (!nearJob && !alerts?.length) return NextResponse.json({ error: "Push-to-talk is available from 30 minutes before a confirmed job until 30 minutes after it ends." }, { status: 403 });

  const at = new AccessToken(key, secret, { identity: `${me!.role}:${auth.user.id}`, name: me!.role === "parent" ? "Parent" : (me!.full_name ?? "Teen").split(" ")[0], ttl: "15m" });
  at.addGrant({ room: `ptt_${teenId}`, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: false, canPublishSources: [TrackSource.MICROPHONE] });
  return NextResponse.json({ url: LIVEKIT_URL, token: await at.toJwt() });
}
