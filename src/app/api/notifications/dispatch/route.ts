import { NextResponse } from "next/server";
import { isDemoMode } from "@/lib/config";
import { dispatchDue } from "@/lib/safety/dispatch";
import { getServerSupabase, getServiceSupabase } from "@/lib/supabase/server";

/**
 * Sends queued notification emails/SMS.
 * - Scheduled: Supabase pg_cron (every minute) or Vercel Cron with `Authorization: Bearer $CRON_SECRET`.
 * - Kick: any signed-in user may trigger a small run right after an action, so alerts don't wait for the schedule.
 */
async function handle(req: Request) {
  if (isDemoMode) return NextResponse.json({ error: "Requires the live backend." }, { status: 400 });
  const service = getServiceSupabase();
  if (!service) return NextResponse.json({ error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 503 });
  const secret = process.env.CRON_SECRET;
  const authz = req.headers.get("authorization");
  let limit = 10;
  if (secret && authz === `Bearer ${secret}`) limit = 100;
  else {
    const supabase = await getServerSupabase();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  }
  try {
    return NextResponse.json({ ok: true, ...(await dispatchDue(service, limit)) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
export const GET = handle;
export const POST = handle;
