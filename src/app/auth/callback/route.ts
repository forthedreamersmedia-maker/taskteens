import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/config";

/** Handles Supabase email-verification and password-recovery links (PKCE code exchange). */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const nextParam = url.searchParams.get("next") ?? "/dashboard";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/dashboard";
  if (isDemoMode || !code) return NextResponse.redirect(new URL(next, url.origin));
  const supabase = await getServerSupabase();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(new URL(`/auth/sign-in?error=link_expired`, url.origin));
  return NextResponse.redirect(new URL(next, url.origin));
}
