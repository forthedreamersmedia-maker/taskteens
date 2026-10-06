import { NextResponse } from "next/server";
import { isDemoMode } from "@/lib/config";
import { autoInviteFromSignup } from "@/lib/safety/invitations";
import { getServerSupabase, getServiceSupabase } from "@/lib/supabase/server";

/** Handles Supabase email-verification and password-recovery links (PKCE code exchange). */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const nextParam = url.searchParams.get("next") ?? "/dashboard";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/dashboard";
  if (isDemoMode || !code) return NextResponse.redirect(new URL(next, url.origin));
  const supabase = await getServerSupabase();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(new URL(`/auth/sign-in?error=link_expired`, url.origin));
  // A teen just confirmed their email: send the parent invitation using the details from sign-up.
  const service = getServiceSupabase();
  if (service && data.user) await autoInviteFromSignup(service, data.user.id).catch((e) => console.error("[parent-invite:auto]", e));
  return NextResponse.redirect(new URL(next, url.origin));
}
