"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getDataClient, type DataClient } from "./data";
import type { Session } from "./types";

interface AuthState {
  session: Session | null;
  loading: boolean;
  refresh: () => Promise<void>;
  data: DataClient;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const data = useMemo(() => getDataClient(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setSession(await data.getSession());
    } finally {
      setLoading(false);
    }
  }, [data]);

  useEffect(() => {
    refresh();
    return data.onAuthChange((s) => {
      setSession(s);
      setLoading(false);
    });
  }, [data, refresh]);

  return <AuthContext.Provider value={{ session, loading, refresh, data }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

export function useData() {
  return useAuth().data;
}

export function dashboardPathFor(role: string | undefined) {
  if (role === "admin") return "/admin";
  if (role === "employer") return "/dashboard/employer";
  return "/dashboard/teen";
}
