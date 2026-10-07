import { after, NextResponse } from "next/server";
import { z } from "zod";
import { isDemoMode } from "@/lib/config";
import { dispatchDue } from "@/lib/safety/dispatch";
import { getServerSupabase, getServiceSupabase } from "@/lib/supabase/server";

const schema = z.object({ conversation_id: z.string().uuid(), body: z.string().trim().min(1).max(2000) });

/**
 * POST /api/messages — send a message as the signed-in teen, employer or parent.
 * The database decides the sender label, blocks explicit contact details, flags softer
 * off-platform attempts for the parent and moderators, and queues notifications (sent right after).
 */
export async function POST(req: Request) {
  if (isDemoMode) return NextResponse.json({ error: "Messaging requires the live backend." }, { status: 400 });
  const supabase = await getServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Write a message (up to 2000 characters)." }, { status: 422 });
  const { data, error } = await supabase.rpc("send_message", { p_conversation: parsed.data.conversation_id, p_body: parsed.data.body });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const service = getServiceSupabase();
  if (service) after(() => dispatchDue(service, 15).catch((e) => console.error("[dispatch]", e)));
  return NextResponse.json(data);
}
