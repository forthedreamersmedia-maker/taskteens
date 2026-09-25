/**
 * Runtime configuration. When Supabase env vars are missing the app runs in
 * LOCAL DEMONSTRATION MODE: data lives in the browser (localStorage), sign-in
 * uses demo accounts, and emails are written to an on-screen outbox instead
 * of being sent.
 */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const isDemoMode = !SUPABASE_URL || !SUPABASE_ANON_KEY;
