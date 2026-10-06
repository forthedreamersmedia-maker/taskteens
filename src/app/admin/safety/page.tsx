"use client";
import { Ban, MapPin, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { AdminShell } from "@/components/dashboard/admin-shell";
import { NoteActionModal, type PendingAction } from "@/components/dashboard/note-action";
import { RequiresBackend } from "@/components/safety/demo-notice";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { isDemoMode } from "@/lib/config";
import { must, safetySupabase, useSafetyQuery } from "@/lib/safety/client";
import { formatDateTime } from "@/lib/utils";

interface AdminAlert {
  id: string; level: "unsafe" | "emergency" | "missed_checkin"; status: string; created_at: string; resolved_at: string | null; resolution_note: string | null;
  teen_id: string; teen_name: string; teen_phone: string | null; parent_contacts: { name: string | null; email: string; phone: string | null }[];
  employer_id: string | null; employer_name: string | null; employer_restricted: boolean; application_id: string | null; job_title: string | null;
  teen_note: string | null; teen_says_safe_at: string | null; call_screen_requested: boolean; has_location_snapshot: boolean; incident_open: boolean;
}
interface Restriction {
  id: string; user_id: string; user_name: string; user_email: string; user_role: string; reason: string; created_by_role: string | null;
  related_alert_id: string | null; status: string; notice_sent_at: string | null; created_at: string; lifted_at: string | null; lift_note: string | null;
}

const LEVEL: Record<AdminAlert["level"], { label: string; tone: "coral" | "amber" | "gray" }> = {
  emergency: { label: "Emergency", tone: "coral" }, unsafe: { label: "Feels unsafe", tone: "amber" }, missed_checkin: { label: "Missed check-in", tone: "gray" },
};

/** Teen safety alerts and account restrictions. Every action needs a note and is audit-logged. */
export default function AdminSafety() {
  const toast = useToast();
  const [showClosed, setShowClosed] = useState(false);
  const [action, setAction] = useState<PendingAction | null>(null);
  const [locations, setLocations] = useState<Record<string, { lat: number; lng: number; recorded_at: string } | null>>({});
  const q = useSafetyQuery(async (sb) => ({
    alerts: must(await sb.rpc("admin_safety_alerts", { p_include_resolved: showClosed })) as AdminAlert[],
    restrictions: must(await sb.rpc("admin_restrictions", { p_include_lifted: showClosed })) as Restriction[],
  }), [showClosed]);
  if (isDemoMode) return <AdminShell title="Safety alerts"><RequiresBackend feature="Safety alerts" /></AdminShell>;
  const sb = safetySupabase()!;

  const resolve = (a: AdminAlert, unfreeze: boolean) => setAction({
    title: unfreeze ? "Resolve and unfreeze the job?" : "Resolve this alert?",
    description: unfreeze ? "Messaging and status changes resume for this job if no other alert or incident is open. Restrictions are not lifted automatically." : "The job stays frozen and any restriction stays in place.",
    confirmLabel: "Resolve", requireNote: true,
    run: async (n) => { must(await sb.rpc("admin_resolve_alert", { p_alert: a.id, p_note: n, p_unfreeze_job: unfreeze })); },
  });
  const restrict = (a: AdminAlert) => setAction({
    title: `Restrict ${a.employer_name ?? "this employer"}?`, danger: true,
    description: "Their listings are hidden, and they can't publish, message or change applications. They are not notified until you send the neutral notice.",
    confirmLabel: "Restrict", requireNote: true,
    run: async (n) => { must(await sb.rpc("admin_restrict_user", { p_user: a.employer_id, p_reason: n, p_alert: a.id, p_incident: null })); },
  });
  const viewLocation = (a: AdminAlert) => setAction({
    title: "View the location snapshot?", description: "This is the teen's last shared position when the alert was sent. Your reason is logged.",
    confirmLabel: "View", requireNote: true,
    run: async (n) => { const v = must(await sb.rpc("admin_alert_location", { p_alert: a.id, p_reason: n })); setLocations((m) => ({ ...m, [a.id]: v as never })); },
  });
  const notice = async (r: Restriction) => {
    const { error } = await sb.rpc("admin_send_restriction_notice", { p_restriction: r.id });
    if (error) return toast({ tone: "error", title: "Couldn't send", body: error.message });
    toast({ tone: "success", title: "Neutral notice sent" }); q.reload();
  };
  const lift = (r: Restriction) => setAction({
    title: `Lift the restriction on ${r.user_name || r.user_email}?`, confirmLabel: "Lift", requireNote: true,
    run: async (n) => { must(await sb.rpc("admin_lift_restriction", { p_restriction: r.id, p_note: n })); },
  });

  return (
    <AdminShell title="Safety alerts" subtitle="Teen SOS alerts, missed check-ins and account restrictions. Employers never see alerts.">
      <label className="mb-4 flex items-center gap-2 text-sm"><input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} /> Include resolved alerts and lifted restrictions</label>
      {q.loading && !q.data ? <Skeleton className="h-40" /> : q.error ? <ErrorState message={q.error} onRetry={q.reload} /> : (
        <div className="space-y-8">
          <section>
            <h2 className="mb-3 text-lg font-bold">Alerts</h2>
            {!q.data!.alerts.length ? <EmptyState icon={ShieldAlert} title="No open alerts" /> : (
              <ul className="space-y-3">
                {q.data!.alerts.map((a) => {
                  const loc = locations[a.id];
                  return (
                    <li key={a.id} className={a.status === "open" && a.level === "emergency" ? "card border-2 border-coral-400 p-4" : "card p-4"}>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={LEVEL[a.level].tone}>{LEVEL[a.level].label}</Badge>
                        <Badge tone={a.status === "open" ? "coral" : "gray"}>{a.status}</Badge>
                        {a.incident_open && <Badge tone="amber">Job frozen</Badge>}
                        {a.employer_restricted && <Badge tone="coral">Employer restricted</Badge>}
                        <span className="text-xs text-navy-400">{formatDateTime(a.created_at)}</span>
                      </div>
                      <p className="mt-2 text-sm"><strong>{a.teen_name}</strong>{a.teen_phone ? ` · ${a.teen_phone}` : ""}{a.job_title ? ` · “${a.job_title}”` : " · not tied to a job"}{a.employer_name ? ` · employer: ${a.employer_name}` : ""}</p>
                      <p className="mt-1 text-xs text-navy-500">Parents: {a.parent_contacts.length ? a.parent_contacts.map((p) => `${p.name ?? p.email} (${p.phone ?? "no phone"}, ${p.email})`).join("; ") : "none linked"}</p>
                      {a.level === "emergency" && <p className="mt-1 text-xs text-navy-500">{a.call_screen_requested ? "The teen's phone opened the 911 call screen. Whether a call was placed is unknown." : "The 911 call screen was not recorded as opened."}</p>}
                      {a.teen_note && <blockquote className="mt-2 rounded-xl bg-cream-50 p-2 text-sm">Teen: “{a.teen_note}”</blockquote>}
                      {a.teen_says_safe_at && <p className="mt-1 text-xs text-emerald-700">Teen tapped “I&apos;m safe now” at {formatDateTime(a.teen_says_safe_at)}</p>}
                      {a.resolution_note && <p className="mt-1 text-xs text-navy-500">Resolved {a.resolved_at ? formatDateTime(a.resolved_at) : ""}: {a.resolution_note}</p>}
                      {loc && <a className="link mt-1 block text-xs" target="_blank" rel="noopener noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${loc.lat},${loc.lng}`}>Snapshot location ({formatDateTime(loc.recorded_at)}) — open map</a>}
                      <div className="mt-3 flex flex-wrap gap-2">
                        {a.has_location_snapshot && !loc && <button className="btn-outline btn-sm" onClick={() => viewLocation(a)}><MapPin className="h-4 w-4" aria-hidden="true" /> View location snapshot</button>}
                        {a.employer_id && !a.employer_restricted && a.level !== "missed_checkin" && <button className="btn-danger btn-sm" onClick={() => restrict(a)}><Ban className="h-4 w-4" aria-hidden="true" /> Restrict employer</button>}
                        {a.status === "open" && <button className="btn-outline btn-sm" onClick={() => resolve(a, false)}>Resolve</button>}
                        {a.incident_open && <button className="btn-outline btn-sm" onClick={() => resolve(a, true)}>{a.status === "open" ? "Resolve & unfreeze job" : "Unfreeze job"}</button>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
          <section>
            <h2 className="mb-3 text-lg font-bold">Restrictions</h2>
            {!q.data!.restrictions.length ? <EmptyState icon={Ban} title="No active restrictions" /> : (
              <ul className="space-y-3">
                {q.data!.restrictions.map((r) => (
                  <li key={r.id} className="card p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={r.status === "active" ? "coral" : "gray"}>{r.status}</Badge>
                      <Badge tone="gray">{r.user_role}</Badge>
                      {r.created_by_role === "system" && <Badge tone="amber">Automatic</Badge>}
                      <span className="text-xs text-navy-400">{formatDateTime(r.created_at)}</span>
                    </div>
                    <p className="mt-2 text-sm"><strong>{r.user_name || r.user_email}</strong> · {r.user_email}</p>
                    <p className="mt-1 text-sm text-navy-600">{r.reason}</p>
                    <p className="mt-1 text-xs text-navy-500">{r.notice_sent_at ? `Neutral notice sent ${formatDateTime(r.notice_sent_at)}` : "The user has not been notified."}{r.lift_note ? ` · Lifted: ${r.lift_note}` : ""}</p>
                    {r.status === "active" && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {!r.notice_sent_at && <button className="btn-outline btn-sm" onClick={() => notice(r)}>Send neutral notice</button>}
                        <button className="btn-outline btn-sm" onClick={() => lift(r)}>Lift restriction</button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
      <NoteActionModal action={action} onClose={() => setAction(null)} onDone={() => { setAction(null); toast({ tone: "success", title: "Recorded" }); q.reload(); }} />
    </AdminShell>
  );
}
