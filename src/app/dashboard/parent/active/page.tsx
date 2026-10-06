"use client";
import { CheckCircle2, Clock, Flag, MapPin, Phone, PhoneCall, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ParentShell } from "@/components/dashboard/parent-shell";
import { RequiresBackend } from "@/components/safety/demo-notice";
import { PushToTalk } from "@/components/safety/push-to-talk";
import { Alert, EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { isDemoMode } from "@/lib/config";
import { timeRange, type ActiveJob } from "@/lib/safety/active";
import { must, safetySupabase, useSafetyQuery } from "@/lib/safety/client";
import { formatDateTime } from "@/lib/utils";

interface Point { session_id: string; lat: number; lng: number; accuracy_m: number | null; recorded_at: string }

export default function ParentActive() {
  const toast = useToast();
  const q = useSafetyQuery(async (sb) => {
    const jobs = (must(await sb.rpc("active_jobs")) as ActiveJob[]) ?? [];
    const teenIds = [...new Set(jobs.map((j) => j.teen_id))];
    const phones = teenIds.length ? ((await sb.from("users").select("id,phone").in("id", teenIds)).data ?? []) as { id: string; phone: string | null }[] : [];
    const points = ((await sb.from("location_current").select("session_id,lat,lng,accuracy_m,recorded_at")).data ?? []) as Point[];
    return { jobs, phones: new Map(phones.map((p) => [p.id, p.phone])), points: new Map(points.map((p) => [p.session_id, p])) };
  }, []);
  const [, tick] = useState(0);
  useEffect(() => {
    const sb = safetySupabase();
    if (!sb) return;
    const ch = sb.channel("parent-active")
      .on("postgres_changes", { event: "*", schema: "public", table: "location_current" }, () => q.reload())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "job_checkins" }, () => q.reload())
      .on("postgres_changes", { event: "*", schema: "public", table: "safety_alerts" }, () => q.reload())
      .subscribe();
    const t = setInterval(() => tick((x) => x + 1), 10_000);
    return () => { sb.removeChannel(ch); clearInterval(t); };
  }, [q.reload]); // eslint-disable-line react-hooks/exhaustive-deps
  if (isDemoMode) return <ParentShell title="Active jobs"><RequiresBackend feature="Live check-ins and location" /></ParentShell>;
  const sb = safetySupabase()!;

  return (
    <ParentShell title="Active jobs" subtitle="Check-ins, optional live location and quick ways to reach your teen. In an emergency, call 911.">
      <a href="tel:911" className="btn mb-4 w-full bg-coral-600 text-white hover:bg-coral-700 sm:w-auto"><PhoneCall className="h-4 w-4" aria-hidden="true" /> Call 911</a>
      {q.loading && !q.data ? <Skeleton className="h-48" /> : q.error ? <ErrorState message={q.error} onRetry={q.reload} /> : !q.data!.jobs.length ? (
        <EmptyState icon={Clock} title="No confirmed jobs right now" body="Jobs you approve appear here from a week before until shortly after they end." />
      ) : (
        <div className="space-y-4">
          {q.data!.jobs.map((j) => {
            const pt = j.session_id ? q.data!.points.get(j.session_id) : undefined;
            const age = pt ? Math.round((Date.now() - new Date(pt.recorded_at).getTime()) / 1000) : null;
            const phone = q.data!.phones.get(j.teen_id);
            return (
              <section key={j.shift_id} className="card space-y-4 p-5" aria-label={`${j.teen_name}: ${j.job_title}`}>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-navy-400">{j.teen_name}</p>
                  <h2 className="text-lg font-bold">{j.job_title}</h2>
                  <p className="text-sm text-navy-500">{j.employer_name} · {timeRange(j.starts_at, j.ends_at)}</p>
                </div>
                {j.open_alert_level === "missed_checkin" && (
                  <Alert tone="warn" title="Missed check-in">
                    Your teen hasn&apos;t checked in. Try calling them. If you believe they are in danger, call 911.
                    <button type="button" className="btn-outline btn-sm mt-2 block" onClick={async () => { const { error } = await sb.rpc("parent_resolve_alert", { p_alert: j.open_alert_id, p_note: "Parent reached teen" }); if (error) toast({ tone: "error", title: "Couldn't update", body: error.message }); else { toast({ tone: "success", title: "Marked safe" }); q.reload(); } }}><ShieldCheck className="h-4 w-4" aria-hidden="true" /> I reached my teen — they&apos;re safe</button>
                  </Alert>
                )}
                <ol className="flex flex-wrap gap-4 text-sm">
                  <li className={j.arrived_at ? "text-emerald-700" : "text-navy-400"}>{j.arrived_at ? <CheckCircle2 className="mr-1 inline h-4 w-4" aria-hidden="true" /> : <Clock className="mr-1 inline h-4 w-4" aria-hidden="true" />}{j.arrived_at ? `Arrived ${formatDateTime(j.arrived_at)}` : "Not checked in"}</li>
                  <li className={j.finished_at ? "text-emerald-700" : "text-navy-400"}>{j.finished_at ? `Checked out ${formatDateTime(j.finished_at)}` : "Not checked out"}</li>
                </ol>
                <div className="rounded-2xl bg-cream-50 p-3 text-sm">
                  <p className="flex items-center gap-1.5 font-semibold"><MapPin className="h-4 w-4" aria-hidden="true" /> Live location</p>
                  {!j.location_allowed ? <p className="mt-1 text-navy-500">Off — you haven&apos;t allowed location sharing (change it on your Overview).</p>
                    : !j.session_id ? <p className="mt-1 text-navy-500">Not being shared right now. Your teen chooses when to turn it on.</p>
                    : !pt ? <p className="mt-1 text-amber-700">Sharing is on, but no position has arrived yet.</p>
                    : (
                      <div className="mt-2 space-y-2">
                        <p className={age != null && age > 90 ? "font-semibold text-amber-700" : "text-emerald-700"}>
                          {age != null && age > 90 ? `Last update ${Math.round(age / 60)} min ago — their phone may have lost signal or closed the page.` : `Updated ${age}s ago`}{pt.accuracy_m ? ` · accurate to about ${Math.round(pt.accuracy_m)} m` : ""}
                        </p>
                        <iframe title={`${j.teen_name}'s current location`} className="h-56 w-full rounded-xl border border-navy-100" loading="lazy"
                          src={`https://www.openstreetmap.org/export/embed.html?bbox=${pt.lng - 0.006},${pt.lat - 0.004},${pt.lng + 0.006},${pt.lat + 0.004}&layer=mapnik&marker=${pt.lat},${pt.lng}`} />
                        <a className="link text-xs" target="_blank" rel="noopener noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${pt.lat},${pt.lng}`}>Open in Google Maps</a>
                        <p className="text-[11px] text-navy-400">Only you can see this. It disappears when the job ends; no history is kept.</p>
                      </div>
                    )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {phone ? <a href={`tel:${phone}`} className="btn-outline"><Phone className="h-4 w-4" aria-hidden="true" /> Call {j.teen_name.split(" ")[0]}</a> : <span className="text-xs text-navy-400">No phone number on your teen&apos;s account.</span>}
                  <Link href={`/report?type=application&id=${j.application_id}&severity=urgent`} className="btn-outline"><Flag className="h-4 w-4" aria-hidden="true" /> Report an incident</Link>
                </div>
                {(j.window_open || j.open_alert_id) && <PushToTalk teenId={j.teen_id} otherLabel={j.teen_name.split(" ")[0]!} callHref={phone ? `tel:${phone}` : null} />}
              </section>
            );
          })}
        </div>
      )}
    </ParentShell>
  );
}
