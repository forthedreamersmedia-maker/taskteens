"use client";
import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isDemoMode } from "@/lib/config";
import { getBrowserSupabase } from "@/lib/supabase/client";

/** Safety features talk to Supabase directly (RLS enforces access). They are unavailable in demo mode. */
export function safetySupabase(): SupabaseClient | null {
  return isDemoMode ? null : getBrowserSupabase();
}

/** Small loader hook: runs `fn` with the Supabase client and tracks loading/error state. */
export function useSafetyQuery<T>(fn: (sb: SupabaseClient) => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!isDemoMode);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fn, deps);
  const reload = useCallback(async () => {
    const sb = safetySupabase();
    if (!sb) return;
    setLoading(true);
    try {
      setData(await run(sb));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e));
    } finally {
      setLoading(false);
    }
  }, [run]);
  useEffect(() => { reload(); }, [reload]);
  return { data, error, loading, reload, setData };
}

/** Throws the Supabase error message so callers can show it. */
export function must<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
}
