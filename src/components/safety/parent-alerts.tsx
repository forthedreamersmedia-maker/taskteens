"use client";
import { MapPin, Phone, PhoneCall, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { must, safetySupabase, useSafetyQuery } from "@/lib/safety/client";
import { formatDateTime } from "@/lib/utils";

interface ParentAlert {
  id: string; teen_id: string; teen_name: string; level: "unsafe" | "emergency"; created_at: string; job_title: string | null; teen_note: string | null;
  teen_says_safe_at: string | null; call_screen_requested: boolean; last_location: { lat: number; lng: number; accuracy_m: number | null; recorded_at: string } | null; teen_phone: string | null;
}

/** Open "I feel unsafe" / emergency alerts for the parent's linked teens. Updates live. */
export function ParentAlerts({ onChange }: { onChange?: () => void }) {
  const toast = useToast();
  const [closing, setClosing] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const q = useSafetyQuery(async (sb) => must(await sb.rpc("parent_open_alerts")) as ParentAlert[], []);
  useEffect(() => {
    const sb = safetySupabase();
    if (!sb) return;
    const ch = sb.channel("parent-alerts").on("postgres_changes", { event: "*", schema: "public", table: "safety_alerts" }, () => q.reload()).subscribe();
    return () => { sb.removeChannel(ch); };
  }, [q.reload]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!q.data?.length) return null;

  const close = async (a: ParentAlert) => {
    const { error } = await safetySupabase()!.rpc("parent_resolve_alert", { p_alert: a.id, p_note: note.trim() || "Parent confirmed teen is safe" });
    if (error) return toast({ tone: "error", title: "Couldn't close the alert", body: error.message });
    setClosing(null); setNote("");
    toast({ tone: "success", title: "Alert closed", body: "TaskTeens will still review what happened." });
    q.reload(); onChange?.();
  };

  return (
    <div className="mb-4 space-y-3">
      {q.data.map((a) => {
        const first = a.teen_name.split(" ")[0] || "Your teen";
        return (
          <section key={a.id} role="alert" className={a.level === "emergency" ? "rounded-2xl border-2 border-coral-500 bg-coral-50 p-4" : "rounded-2xl border-2 border-amber-400 bg-amber-50 p-4"}>
            <p className="text-base font-bold text-navy-900">
              {a.level === "emergency" ? `EMERGENCY — ${first} pressed the emergency button` : `${first} says they feel unsafe`}
            </p>
            <p className="mt-1 text-sm text-navy-700">
              {formatDateTime(a.created_at)}{a.job_title ? ` · during “${a.job_title}”` : ""}
              {a.level === "emergency" && (a.call_screen_requested ? ` · their phone's 911 call screen was opened (we can't tell whether the call went through)` : "")}
            </p>
            {a.teen_note && <blockquote className="mt-2 rounded-xl bg-white/70 p-2 text-sm">“{a.teen_note}”</blockquote>}
            {a.teen_says_safe_at && <Alert tone="success" className="mt-2" title={`${first} tapped "I'm safe now" at ${formatDateTime(a.teen_says_safe_at)}`}>Confirm with them directly before closing this.</Alert>}
            <p className="mt-2 text-sm font-semibold text-navy-800">Call {first} now. If you believe they are in danger, call 911 — TaskTeens can&apos;t call 911 for you.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {a.teen_phone && <a href={`tel:${a.teen_phone}`} className="btn-navy btn-sm"><Phone className="h-4 w-4" aria-hidden="true" /> Call {first}</a>}
              <a href="tel:911" className="btn btn-sm bg-coral-600 text-white hover:bg-coral-700"><PhoneCall className="h-4 w-4" aria-hidden="true" /> Call 911</a>
              {a.last_location && <a className="btn-outline btn-sm" target="_blank" rel="noopener noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${a.last_location.lat},${a.last_location.lng}`}><MapPin className="h-4 w-4" aria-hidden="true" /> Last shared location ({formatDateTime(a.last_location.recorded_at)})</a>}
              {closing !== a.id && <button type="button" className="btn-outline btn-sm" onClick={() => setClosing(a.id)}><ShieldCheck className="h-4 w-4" aria-hidden="true" /> I&apos;ve confirmed {first} is safe</button>}
            </div>
            {!a.last_location && <p className="mt-1 text-xs text-navy-500">{first} wasn&apos;t sharing location when the alert was sent.</p>}
            {closing === a.id && (
              <div className="mt-3 rounded-xl bg-white p-3">
                <label htmlFor={`close-${a.id}`} className="text-xs font-semibold">What happened? (optional, shared with TaskTeens)</label>
                <textarea id={`close-${a.id}`} className="input mt-1" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
                <div className="mt-2 flex gap-2">
                  <button type="button" className="btn-navy btn-sm" onClick={() => close(a)}>Close alert</button>
                  <button type="button" className="btn-outline btn-sm" onClick={() => setClosing(null)}>Cancel</button>
                </div>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
