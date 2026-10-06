"use client";
import { FileText } from "lucide-react";
import { ParentShell } from "@/components/dashboard/parent-shell";
import { RequiresBackend } from "@/components/safety/demo-notice";
<<<<<<< HEAD
import { ParentApplicationCard } from "@/components/safety/parent-application-card";
=======
import { StatusBadge } from "@/components/ui/badge";
>>>>>>> 3e1cd4106bc8ed94a84e04cc9b624fcfd5c621d7
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { isDemoMode } from "@/lib/config";
import { useSafetyQuery } from "@/lib/safety/client";
import { loadMyTeens, loadTeenApplications } from "@/lib/safety/parent";
<<<<<<< HEAD
=======
import { formatDate, timeAgo } from "@/lib/utils";
>>>>>>> 3e1cd4106bc8ed94a84e04cc9b624fcfd5c621d7

export default function ParentApplications() {
  const q = useSafetyQuery(async (sb) => ({ teens: await loadMyTeens(sb), apps: await loadTeenApplications(sb) }), []);
  if (isDemoMode) return <ParentShell title="Applications"><RequiresBackend feature="The parent dashboard" /></ParentShell>;
  const name = (id: string) => q.data?.teens.find((t) => t.teen_id === id)?.full_name.split(" ")[0] ?? "Your teen";
<<<<<<< HEAD
  const apps = [...(q.data?.apps ?? [])].sort((a, b) => Number(b.status === "selected") - Number(a.status === "selected"));
  return (
    <ParentShell title="Applications" subtitle="Jobs marked “awaiting parent approval” need your decision. Nothing is confirmed — and the address isn't shared — until you approve.">
      {q.loading && !q.data ? <Skeleton className="h-40" /> : q.error ? <ErrorState message={q.error} onRetry={q.reload} /> : !apps.length ? (
        <EmptyState icon={FileText} title="No applications yet" body="You'll be notified here (and by email) when your teen applies." />
      ) : (
        <ul className="space-y-3">{apps.map((a) => <ParentApplicationCard key={a.id} app={a} teenName={name(a.teen_id)} onChanged={q.reload} />)}</ul>
=======
  return (
    <ParentShell title="Applications" subtitle="Every job your teen applied to. Jobs marked “awaiting parent approval” need your decision before they're confirmed.">
      {q.loading && !q.data ? <Skeleton className="h-40" /> : q.error ? <ErrorState message={q.error} onRetry={q.reload} /> : !q.data!.apps.length ? (
        <EmptyState icon={FileText} title="No applications yet" body="You'll be notified by email and here when your teen applies." />
      ) : (
        <ul className="space-y-3">
          {q.data!.apps.map((a) => (
            <li key={a.id} className="card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-navy-400">{name(a.teen_id)}</p>
                  <h2 className="font-bold">{a.job?.title ?? "Listing"}</h2>
                  <p className="text-sm text-navy-500">{a.employer?.display_name} · {a.job?.city}{a.job?.start_date ? ` · ${formatDate(a.job.start_date)}` : ""}</p>
                </div>
                <StatusBadge status={a.status} />
              </div>
              <p className="mt-2 text-xs text-navy-400">Applied {formatDate(a.created_at)} · updated {timeAgo(a.status_updated_at)}</p>
            </li>
          ))}
        </ul>
>>>>>>> 3e1cd4106bc8ed94a84e04cc9b624fcfd5c621d7
      )}
    </ParentShell>
  );
}
