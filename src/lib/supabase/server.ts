import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "../config";

/** Supabase client acting as the signed-in user (RLS applies). */
export async function getServerSupabase(): Promise<SupabaseClient> {
  const store = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          /* called from a Server Component — middleware refreshes cookies */
        }
      },
    },
  });
}

/**
 * Service-role client. Bypasses RLS — only use AFTER verifying the caller,
 * and only for narrowly-scoped reads (e.g. looking up a recipient's email).
 */
export function getServiceSupabase(): SupabaseClient | null {
  // SUPABASE_SECRET_KEY is what the Vercel ↔ Supabase integration sets automatically.
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.SUPABASE_SECRET_KEY?.trim();
  if (!key || !SUPABASE_URL) return null;
  return createClient(SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
