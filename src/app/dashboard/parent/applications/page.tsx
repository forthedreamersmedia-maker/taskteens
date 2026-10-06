"use client";
import { FileText } from "lucide-react";
import { ParentShell } from "@/components/dashboard/parent-shell";
import { RequiresBackend } from "@/components/safety/demo-notice";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { isDemoMode } from "@/lib/config";
import { useSafetyQuery } from "@/lib/safety/client";
import { loadMyTeens, loadTeenApplications } from "@/lib/safety/parent";
import { formatDate, timeAgo } from "@/lib/utils";

export default function ParentApplications() {
  const q = useSafetyQuery(async (sb) => ({ teens: await loadMyTeens(sb), apps: await loadTeenApplications(sb) }), []);
  if (isDemoMode) return <ParentShell title="Applications"><RequiresBackend feature="The parent dashboard" /></ParentShell>;
  const name = (id: string) => q.data?.teens.find((t) => t.teen_id === id)?.full_name.split(" ")[0] ?? "Your teen";
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
      )}
    </ParentShell>
  );
}
