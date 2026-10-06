"use client";
import { CheckCircle2, LogIn, LogOut, MapPin, Phone } from "lucide-react";
import { useState } from "react";
import { TeenShell } from "@/components/dashboard/teen-shell";
import { RequiresBackend } from "@/components/safety/demo-notice";
import { useLocationSharing } from "@/components/safety/location-sharing";
import { PushToTalk } from "@/components/safety/push-to-talk";
import { SosPanel } from "@/components/safety/sos";
import { Alert, EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/lib/auth-context";
import { isDemoMode } from "@/lib/config";
import { timeRange, type ActiveJob } from "@/lib/safety/active";
import { must, safetySupabase, useSafetyQuery } from "@/lib/safety/client";
import { kickNotifications } from "@/lib/safety/kick";
import { formatDateTime } from "@/lib/utils";

export default function TeenActive() {
  const { session } = useAuth();
  const toast = useToast();
  const loc = useLocationSharing();
  const [busy, setBusy] = useState(false);
  const q = useSafetyQuery(async (sb) => ({
    jobs: (must(await sb.rpc("active_jobs")) as ActiveJob[]) ?? [],
    parents: ((await sb.from("parent_profiles").select("user_id,display_name,phone_e164")).data ?? []) as { user_id: string; display_name: string; phone_e164: string | null }[],
  }), [session?.user.id]);
  if (isDemoMode) return <TeenShell title="Active job"><RequiresBackend feature="Check-ins and safety tools" /></TeenShell>;
  const sb = safetySupabase()!;
  const parentPhone = q.data?.parents.find((p) => p.phone_e164)?.phone_e164 ?? null;
  const callParent = parentPhone ? `tel:${parentPhone}` : null;

  const checkin = async (j: ActiveJob, kind: "arrived" | "finished") => {
    setBusy(true);
    const { error } = await sb.rpc("teen_checkin", { p_shift: j.shift_id, p_kind: kind });
    setBusy(false);
    if (error) return toast({ tone: "error", title: "Check-in failed", body: error.message });
    kickNotifications();
    toast({ tone: "success", title: kind === "arrived" ? "Checked in — your parent was notified" : "Checked out — location sharing stopped" });
    if (kind === "finished" && loc?.activeShift === j.shift_id) await loc.stop();
    q.reload();
  };

  return (
    <TeenShell title="Active job" subtitle="Check in when you arrive and check out when you leave. Your parent is notified each time.">
      {q.loading && !q.data ? <Skeleton className="h-48" /> : q.error ? <ErrorState message={q.error} onRetry={q.reload} /> : !q.data!.jobs.length ? (
        <EmptyState icon={CheckCircle2} title="No confirmed jobs coming up" body="Jobs appear here once your parent approves them." />
      ) : (
        <div className="space-y-4">
          {q.data!.jobs.map((j) => {
            const sharingThis = loc?.activeShift === j.shift_id && loc.state.kind === "on";
            return (
              <section key={j.shift_id} className="card space-y-4 p-5" aria-label={j.job_title}>
                <div>
                  <h2 className="text-lg font-bold">{j.job_title}</h2>
                  <p className="text-sm text-navy-500">{j.employer_name} · {timeRange(j.starts_at, j.ends_at)}</p>
                </div>
                {j.open_alert_level === "missed_checkin" && <Alert tone="warn" title="Your parent was told you haven't checked in">Check in now if you&apos;ve arrived, or call your parent.</Alert>}
                <div className="flex flex-wrap gap-2">
                  {!j.arrived_at ? (
                    <button type="button" disabled={busy || !j.window_open} className="btn-primary" onClick={() => checkin(j, "arrived")}><LogIn className="h-4 w-4" aria-hidden="true" /> I&apos;ve arrived</button>
                  ) : !j.finished_at ? (
                    <button type="button" disabled={busy} className="btn-navy" onClick={() => checkin(j, "finished")}><LogOut className="h-4 w-4" aria-hidden="true" /> I&apos;m done — check out</button>
                  ) : <p className="flex items-center gap-1.5 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Checked out {formatDateTime(j.finished_at)}</p>}
                  {callParent && <a href={callParent} className="btn-outline"><Phone className="h-4 w-4" aria-hidden="true" /> Call my parent</a>}
                </div>
                {!j.window_open && !j.arrived_at && <p className="text-xs text-navy-400">Check-in opens 30 minutes before the start time.</p>}
                {j.arrived_at && <p className="text-xs text-navy-500">Arrived {formatDateTime(j.arrived_at)}</p>}

                {!j.finished_at && (
                  <div className="rounded-2xl bg-cream-50 p-3 text-sm">
                    <p className="flex items-center gap-1.5 font-semibold"><MapPin className="h-4 w-4" aria-hidden="true" /> Live location (optional)</p>
                    {!j.location_allowed ? <p className="mt-1 text-navy-500">Your parent hasn&apos;t allowed location sharing. They can turn it on from their dashboard.</p>
                      : !j.window_open ? <p className="mt-1 text-navy-500">Available from 30 minutes before the job until 30 minutes after it ends.</p>
                      : sharingThis ? (
                        <div className="mt-1 flex flex-wrap items-center gap-2"><span className="text-emerald-700">Sharing with your parent only. It stops automatically after the job.</span><button type="button" className="btn-outline btn-sm" onClick={() => loc!.stop()}>Stop sharing</button></div>
                      ) : (
                        <div className="mt-1 space-y-1">
                          <p className="text-navy-500">Only your parent sees it — never the employer. TaskTeens keeps no location history.</p>
                          <button type="button" className="btn-outline btn-sm" disabled={loc?.state.kind === "starting"} onClick={() => loc?.start(j.shift_id)}>Share my location with my parent</button>
                        </div>
                      )}
                    {loc?.state.kind === "error" && (loc.activeShift === null || loc.activeShift === j.shift_id) && <p className="mt-1 text-xs text-coral-700">{loc.state.message}</p>}
                  </div>
                )}
                {j.window_open && (
                  <div className="rounded-2xl border border-coral-100 p-3">
                    <p className="mb-2 text-sm font-semibold">Need help?</p>
                    <SosPanel compact applicationId={j.application_id} parentPhone={parentPhone} />
                  </div>
                )}
                {(j.window_open || j.open_alert_id) && session && <PushToTalk teenId={session.user.id} otherLabel="your parent" callHref={callParent} />}
              </section>
            );
          })}
        </div>
      )}
    </TeenShell>
  );
}
