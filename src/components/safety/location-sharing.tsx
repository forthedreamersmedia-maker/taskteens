"use client";
import { MapPin, MapPinOff } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { safetySupabase } from "@/lib/safety/client";

/**
 * Teen-side live location. Runs while any teen dashboard page is open.
 * Truthful states only: it never says "sharing" unless the last update reached the server recently.
 */
export type ShareState =
  | { kind: "off" }
  | { kind: "starting" }
  | { kind: "on"; sessionId: string; lastSentAt: number | null; accuracy: number | null }
  | { kind: "error"; message: string };

interface Ctx { state: ShareState; start: (shiftId: string) => Promise<void>; stop: () => Promise<void>; activeShift: string | null }
const LocationCtx = createContext<Ctx | null>(null);
export const useLocationSharing = () => useContext(LocationCtx);

const MIN_SEND_MS = 15_000;
const STALE_MS = 90_000;

export function LocationSharingProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ShareState>({ kind: "off" });
  const [activeShift, setActiveShift] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const watch = useRef<number | null>(null);
  const session = useRef<string | null>(null);
  const lastSend = useRef(0);

  const clearWatch = () => { if (watch.current != null) navigator.geolocation?.clearWatch(watch.current); watch.current = null; };

  const stop = useCallback(async () => {
    clearWatch();
    const id = session.current;
    session.current = null;
    setActiveShift(null);
    setState({ kind: "off" });
    if (id) await safetySupabase()?.rpc("stop_location_sharing", { p_session: id });
  }, []);

  const start = useCallback(async (shiftId: string) => {
    const sb = safetySupabase();
    if (!sb) return setState({ kind: "error", message: "Location sharing requires the live backend." });
    if (!("geolocation" in navigator)) return setState({ kind: "error", message: "This browser can't share location." });
    setState({ kind: "starting" });
    const { data, error } = await sb.rpc("start_location_sharing", { p_shift: shiftId });
    if (error) return setState({ kind: "error", message: error.message });
    session.current = data as string;
    setActiveShift(shiftId);
    setState({ kind: "on", sessionId: data as string, lastSentAt: null, accuracy: null });
    clearWatch();
    watch.current = navigator.geolocation.watchPosition(
      async (pos) => {
        if (!session.current || Date.now() - lastSend.current < MIN_SEND_MS) return;
        lastSend.current = Date.now();
        const { data: ok, error: e } = await sb.rpc("update_location", { p_session: session.current, p_lat: pos.coords.latitude, p_lng: pos.coords.longitude, p_accuracy: pos.coords.accuracy });
        if (e) return setState({ kind: "error", message: `Couldn't send your location (${e.message}). Check your connection.` });
        if (ok === false) { clearWatch(); session.current = null; setActiveShift(null); return setState({ kind: "error", message: "Location sharing ended (the job's sharing window is over, or your parent turned it off)." }); }
        setState({ kind: "on", sessionId: session.current, lastSentAt: Date.now(), accuracy: Math.round(pos.coords.accuracy) });
      },
      (err) => {
        const msg = err.code === err.PERMISSION_DENIED ? "Location permission is blocked. Allow location for this site in your browser settings." : err.code === err.POSITION_UNAVAILABLE ? "Your location isn't available right now (weak signal?)." : "Getting your location is taking too long.";
        setState((s) => (s.kind === "on" && err.code !== err.PERMISSION_DENIED ? s : { kind: "error", message: msg }));
        if (err.code === err.PERMISSION_DENIED) { const id = session.current; clearWatch(); session.current = null; setActiveShift(null); if (id) sb.rpc("stop_location_sharing", { p_session: id }); }
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 30_000 },
    );
  }, []);

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 5000); return () => { clearInterval(t); clearWatch(); }; }, []);

  return (
    <LocationCtx.Provider value={{ state, start, stop, activeShift }}>
      {state.kind === "on" && <SharingBanner state={state} now={now} onStop={stop} />}
      {children}
    </LocationCtx.Provider>
  );
}

function SharingBanner({ state, now, onStop }: { state: Extract<ShareState, { kind: "on" }>; now: number; onStop: () => void }) {
  const age = state.lastSentAt ? Math.round((now - state.lastSentAt) / 1000) : null;
  const stale = state.lastSentAt == null || now - state.lastSentAt > STALE_MS;
  return (
    <div role="status" className={stale ? "sticky top-0 z-40 bg-amber-500 text-navy-900" : "sticky top-0 z-40 bg-emerald-600 text-white"}>
      <div className="container-page flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
        <p className="flex items-center gap-1.5 font-semibold">
          {stale ? <MapPinOff className="h-4 w-4" aria-hidden="true" /> : <MapPin className="h-4 w-4" aria-hidden="true" />}
          {state.lastSentAt == null ? "Starting location sharing — waiting for your first position…" : stale ? `Location not updating (last sent ${age}s ago). Keep this page open.` : `Sharing your location with your parent · updated ${age}s ago`}
        </p>
        <span className="flex items-center gap-2 text-xs">Only works while this page is open. <button type="button" onClick={onStop} className="rounded-full bg-white/20 px-3 py-1 font-semibold">Stop sharing</button></span>
      </div>
    </div>
  );
}
