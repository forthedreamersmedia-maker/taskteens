"use client";
import { CalendarCheck, MapPin, Phone, ShieldCheck, Users, Video } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { TeenShell } from "@/components/dashboard/teen-shell";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { useData } from "@/lib/auth-context";
import { useAsync } from "@/lib/hooks/use-async";
import type { InterviewWithContext } from "@/lib/data";
import { errorMessage, formatDateTime } from "@/lib/utils";

const FORMAT = { video: { icon: Video, label: "Video call" }, phone: { icon: Phone, label: "Phone call" }, in_person_public: { icon: MapPin, label: "In person (public place)" } };

function InterviewCard({ i, onChange }: { i: InterviewWithContext; onChange: () => void }) {
  const data = useData();
  const toast = useToast();
  const [time, setTime] = useState(i.proposed_times[0] ?? "");
  const [busy, setBusy] = useState(false);
  const F = FORMAT[i.format];
  const respond = async (accept: boolean) => {
    setBusy(true);
    try {
      await data.respondToInterview(i.id, accept, time);
      toast({ tone: "success", title: accept ? "Interview confirmed" : "Interview declined", body: accept ? `See you ${formatDateTime(time)}. Tell a parent or guardian!` : "The employer has been notified." });
      onChange();
    } catch (e) {
      toast({ tone: "error", title: "Couldn't respond", body: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <li className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-lg font-bold">{i.job_title}</p>
          <p className="text-sm text-navy-500">{i.employer_name}</p>
        </div>
        <Badge tone={i.status === "accepted" ? "green" : i.status === "proposed" ? "coral" : "gray"} className="capitalize">{i.status === "proposed" ? "Needs response" : i.status}</Badge>
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-sm text-navy-600">
        <span className="flex items-center gap-1.5"><F.icon className="h-4 w-4 text-navy-400" aria-hidden="true" /> {F.label}</span>
        {i.location_note && <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4 text-navy-400" aria-hidden="true" /> {i.location_note}</span>}
        {i.guardian_invited && <span className="flex items-center gap-1.5"><Users className="h-4 w-4 text-navy-400" aria-hidden="true" /> Parent/guardian welcome</span>}
      </div>
      {i.message && <blockquote className="mt-3 rounded-2xl bg-cream-100 p-3 text-sm text-navy-700">“{i.message}”</blockquote>}
      {i.status === "proposed" ? (
        <fieldset className="mt-4">
          <legend className="label">Pick a time that works</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {i.proposed_times.map((t) => (
              <label key={t} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 text-sm ${time === t ? "border-bay-400 bg-bay-50" : "border-navy-200"}`}>
                <input type="radio" name={`time-${i.id}`} checked={time === t} onChange={() => setTime(t)} className="accent-bay-500" /> {formatDateTime(t)}
              </label>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" disabled={busy || !time} onClick={() => respond(true)} className="btn-primary">Accept time</button>
            <button type="button" disabled={busy} onClick={() => respond(false)} className="btn-outline">Decline</button>
          </div>
        </fieldset>
      ) : i.confirmed_time ? (
        <p className="mt-4 flex items-center gap-2 text-sm font-semibold text-emerald-700"><CalendarCheck className="h-4 w-4" aria-hidden="true" /> {formatDateTime(i.confirmed_time)}</p>
      ) : null}
    </li>
  );
}

export default function TeenInterviews() {
  const data = useData();
  const { data: list, loading, error, reload } = useAsync(() => data.listMyInterviews(), []);
  return (
    <TeenShell title="Interviews" subtitle="Respond to interview requests from employers.">
      <div className="mb-5 flex gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
        <ShieldCheck className="h-5 w-5 shrink-0" aria-hidden="true" />
        <p>Interviews should be by video, phone, or in a public place. Bring a parent or guardian if you&apos;d like — employers are asked to welcome them. <Link href="/safety" className="font-semibold underline">Safety tips</Link></p>
      </div>
      {loading ? (
        <Skeleton className="h-40" />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !list?.length ? (
        <EmptyState icon={CalendarCheck} title="No interview requests yet" body="When an employer wants to meet you, you'll pick a time here." />
      ) : (
        <ul className="space-y-4">{list.map((i) => <InterviewCard key={i.id} i={i} onChange={() => reload(true)} />)}</ul>
      )}
    </TeenShell>
  );
}
