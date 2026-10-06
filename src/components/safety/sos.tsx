"use client";
import { AlertTriangle, CheckCircle2, Phone, PhoneCall, ShieldAlert, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { kickNotifications } from "@/lib/safety/kick";
import { must, safetySupabase, useSafetyQuery } from "@/lib/safety/client";
import { formatDateTime } from "@/lib/utils";

interface OpenAlert {
  id: string; level: "unsafe" | "emergency"; created_at: string; job_title: string | null; call_screen_requested: boolean; teen_says_safe_at: string | null;
  parents_notified: number; deliveries_sent: number; deliveries_pending: number; deliveries_failed: number; deliveries_skipped: number;
}

const COUNTDOWN = 5;

/** Honest summary of how the alert reached the parent. Never claims more than the delivery log shows. */
function deliveryLine(a: OpenAlert) {
  if (!a.parents_notified) return "No parent is linked to your account, so only TaskTeens administrators were alerted. Call someone you trust.";
  const parts = [`Shown in your parent's TaskTeens account.`];
  if (a.deliveries_sent) parts.push(`${a.deliveries_sent} email/text message${a.deliveries_sent === 1 ? "" : "s"} sent.`);
  if (a.deliveries_pending) parts.push(`${a.deliveries_pending} still sending…`);
  if (a.deliveries_failed) parts.push(`${a.deliveries_failed} couldn't be delivered (retrying).`);
  if (a.deliveries_skipped) parts.push(`${a.deliveries_skipped} not available (for example, texting isn't set up).`);
  parts.push("Don't wait for a reply — call them.");
  return parts.join(" ");
}

/**
 * Teen safety buttons. "I feel unsafe" alerts parents and TaskTeens. "Emergency" counts down, alerts them,
 * then opens the phone's call screen with 911 entered — the teen still has to press Call.
 */
export function SosPanel({ applicationId, parentPhone, compact = false }: { applicationId?: string; parentPhone?: string | null; compact?: boolean }) {
  const toast = useToast();
  const [counting, setCounting] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmUnsafe, setConfirmUnsafe] = useState(false);
  const [note, setNote] = useState("");
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const q = useSafetyQuery(async (sb) => must(await sb.rpc("my_open_alerts")) as OpenAlert[], []);

  // Refresh delivery status while an alert is open.
  useEffect(() => {
    if (!q.data?.length) return;
    const t = setInterval(() => q.reload(), 8000);
    return () => clearInterval(t);
  }, [q.data?.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  const raise = async (level: "unsafe" | "emergency") => {
    const sb = safetySupabase();
    if (!sb) return null;
    setBusy(true);
    const { data, error } = await sb.rpc("raise_safety_alert", { p_level: level, p_application: applicationId ?? null, p_note: note.trim() || null });
    setBusy(false);
    if (error) { toast({ tone: "error", title: "The alert didn't send", body: `${error.message}. Call your parent or 911 directly.` }); return null; }
    kickNotifications();
    q.reload();
    return data as string;
  };

  const startEmergency = () => {
    setCounting(COUNTDOWN);
    timer.current = setInterval(() => setCounting((c) => (c == null ? null : Math.max(0, c - 1))), 1000);
  };
  useEffect(() => {
    if (counting !== 0) return;
    if (timer.current) clearInterval(timer.current);
    setCounting(null);
    void fireEmergency();
  }, [counting]); // eslint-disable-line react-hooks/exhaustive-deps
  const cancelEmergency = () => { if (timer.current) clearInterval(timer.current); setCounting(null); };
  const fireEmergency = async () => {
    const id = await raise("emergency");
    // Open the call screen even if the alert failed — calling 911 matters more than our alert.
    if (id) await safetySupabase()?.rpc("alert_call_screen_opened", { p_alert: id });
    window.location.href = "tel:911";
  };

  const sendUnsafe = async () => {
    const id = await raise("unsafe");
    setConfirmUnsafe(false);
    if (id) toast({ tone: "success", title: "Alert sent", body: "Your parent and TaskTeens were alerted. Go somewhere safe and call your parent." });
  };

  const markSafe = async (a: OpenAlert) => {
    const { error } = await safetySupabase()!.rpc("teen_mark_safe", { p_alert: a.id, p_note: null });
    if (error) return toast({ tone: "error", title: "Couldn't update", body: error.message });
    kickNotifications();
    toast({ tone: "success", title: "Your parent was told you're safe" });
    q.reload();
  };

  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      {q.data?.map((a) => (
        <Alert key={a.id} tone={a.teen_says_safe_at ? "success" : "error"} title={a.level === "emergency" ? `Emergency alert sent ${formatDateTime(a.created_at)}` : `"I feel unsafe" alert sent ${formatDateTime(a.created_at)}`}>
          <p>{deliveryLine(a)}</p>
          {a.teen_says_safe_at ? <p className="mt-1 font-medium">You told your parent you&apos;re safe. They&apos;ll close the alert.</p> : (
            <div className="mt-2 flex flex-wrap gap-2">
              {parentPhone && <a href={`tel:${parentPhone}`} className="btn-outline btn-sm"><Phone className="h-4 w-4" aria-hidden="true" /> Call my parent</a>}
              <a href="tel:911" className="btn-sm btn bg-coral-600 text-white hover:bg-coral-700"><PhoneCall className="h-4 w-4" aria-hidden="true" /> Call 911</a>
              <button type="button" className="btn-outline btn-sm" onClick={() => markSafe(a)}><CheckCircle2 className="h-4 w-4" aria-hidden="true" /> I&apos;m safe now</button>
            </div>
          )}
        </Alert>
      ))}

      {counting != null ? (
        <div role="alertdialog" aria-live="assertive" aria-label="Emergency countdown" className="rounded-2xl border-2 border-coral-500 bg-coral-50 p-5 text-center">
          <p className="text-5xl font-black text-coral-700">{counting}</p>
          <p className="mt-2 text-sm font-semibold text-coral-900">Alerting your parent and TaskTeens, then opening your phone&apos;s call screen with 911.</p>
          <p className="mt-1 text-xs text-coral-800">You&apos;ll still need to press Call. TaskTeens can&apos;t call 911 for you.</p>
          <button type="button" className="btn-outline mt-3" onClick={cancelEmergency}><X className="h-4 w-4" aria-hidden="true" /> Cancel — I pressed it by mistake</button>
        </div>
      ) : confirmUnsafe ? (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm">
          <p className="font-semibold text-amber-900">Send an &quot;I feel unsafe&quot; alert?</p>
          <p className="mt-1 text-amber-900">Your parent and TaskTeens are alerted right away. The employer is not told. If you can, leave and go somewhere public.</p>
          <label className="mt-3 block text-xs font-semibold text-amber-900" htmlFor="sos-note">What&apos;s happening? (optional)</label>
          <textarea id="sos-note" className="input mt-1" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="btn-coral" disabled={busy} onClick={sendUnsafe}>{busy ? "Sending…" : "Send alert"}</button>
            <button type="button" className="btn-outline" onClick={() => setConfirmUnsafe(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          <button type="button" className="btn border-2 border-amber-400 bg-amber-50 py-3 text-amber-900 hover:bg-amber-100" disabled={busy} onClick={() => setConfirmUnsafe(true)}>
            <AlertTriangle className="h-5 w-5" aria-hidden="true" /> I feel unsafe
          </button>
          <button type="button" className="btn bg-coral-600 py-3 text-white hover:bg-coral-700" disabled={busy} onClick={startEmergency}>
            <ShieldAlert className="h-5 w-5" aria-hidden="true" /> Emergency
          </button>
        </div>
      )}
      {!compact && counting == null && (
        <p className="text-xs text-navy-400">
          Emergency alerts your parent and TaskTeens, then opens your phone&apos;s call screen with 911 — you press Call. If your phone can&apos;t open it, dial 911 yourself.
          Alerts can be delayed or fail to deliver, so always call if you need help.
        </p>
      )}
    </div>
  );
}
