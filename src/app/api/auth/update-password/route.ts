import { NextResponse } from "next/server";
import { z } from "zod";
import { isDemoMode } from "@/lib/config";
import { getServerSupabase } from "@/lib/supabase/server";

const schema = z.object({
  password: z.string().min(8).max(72).regex(/[A-Za-z]/).regex(/\d/),
});

/**
 * POST /api/auth/update-password — sets a new password for the signed-in user (after a reset link).
 * Uses the cookie session on the server so a second browser tab refreshing its own token can't break it.
 */
export async function POST(req: Request) {
  if (isDemoMode) return NextResponse.json({ error: "Password changes require the live backend." }, { status: 400 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Use 8–72 characters with a letter and a number." }, { status: 422 });
  const supabase = await getServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user)
    return NextResponse.json({ error: "Your reset link has expired. Request a new one and open it in this browser." }, { status: 401 });
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
