/**
 * Runtime configuration. When Supabase env vars are missing (or invalid) the app runs in
 * LOCAL DEMONSTRATION MODE: data lives in the browser (localStorage), sign-in
 * uses demo accounts, and emails are written to an on-screen outbox instead
 * of being sent. Set NEXT_PUBLIC_DEMO_MODE=true to force demo mode.
 */
const isHttpUrl = (v: string | undefined): v is string => {
  if (!v) return false;
  try {
    const u = new URL(v);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
};

const rawSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const rawAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
const rawSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
const vercelUrl = process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL;

export const SUPABASE_URL = isHttpUrl(rawSupabaseUrl) ? rawSupabaseUrl : "";
export const SUPABASE_ANON_KEY = rawAnonKey ?? "";
export const SITE_URL = isHttpUrl(rawSiteUrl) ? rawSiteUrl : vercelUrl ? `https://${vercelUrl}` : "http://localhost:3000";

export const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true" || !SUPABASE_URL || !SUPABASE_ANON_KEY;

/**
 * Cloudflare Turnstile (CAPTCHA). The site key is public. The secret key lives only in
 * Supabase → Authentication → Attack Protection, which verifies every token server-side.
 * When unset, no CAPTCHA is shown.
 */
export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() ?? "";
export const captchaEnabled = !!TURNSTILE_SITE_KEY;
