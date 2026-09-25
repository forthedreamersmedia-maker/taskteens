"use client";
import { Inbox } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo } from "react";
import { EmployerShell } from "@/components/dashboard/employer-shell";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { useData } from "@/lib/auth-context";
import { useAsync } from "@/lib/hooks/use-async";
import { APPLICATION_STATUS_LABEL } from "@/lib/constants";
import type { ApplicationStatus, ApplicationWithJob } from "@/lib/types";
import { cn, timeAgo } from "@/lib/utils";

function Applicants() {
  const data = useData();
  const sp = useSearchParams();
  const router = useRouter();
  const jobFilter = sp.get("job") ?? "";
  const statusFilter = (sp.get("status") ?? "") as ApplicationStatus | "";
  const { data: apps, loading, error, reload } = useAsync(() => data.listEmployerApplications(), []);
  useEffect(() => data.subscribeNotifications(() => reload(true)), [data, reload]);

  const setParam = (k: string, v: string) => {
    const n = new URLSearchParams(sp.toString());
    if (v) n.set(k, v);
    else n.delete(k);
    router.replace(`/dashboard/employer/applications${n.size ? `?${n}` : ""}`, { scroll: false });
  };

  const jobs = useMemo(() => {
    const m = new Map<string, string>();
    apps?.forEach((a) => m.set(a.job_id, a.job.title));
    return [...m.entries()];
  }, [apps]);

  const grouped = useMemo(() => {
    const g = new Map<string, { title: string; items: ApplicationWithJob[] }>();
    (apps ?? [])
      .filter((a) => (!jobFilter || a.job_id === jobFilter) && (!statusFilter || a.status === statusFilter))
      .forEach((a) => {
        if (!g.has(a.job_id)) g.set(a.job_id, { title: a.job.title, items: [] });
        g.get(a.job_id)!.items.push(a);
      });
    return [...g.entries()];
  }, [apps, jobFilter, statusFilter]);

  const statusCounts = useMemo(() => {
    const c: Partial<Record<ApplicationStatus, number>> = {};
    (apps ?? []).filter((a) => !jobFilter || a.job_id === jobFilter).forEach((a) => (c[a.status] = (c[a.status] ?? 0) + 1));
    return c;
  }, [apps, jobFilter]);

  return (
    <EmployerShell title="Applicants" subtitle="Every application to your listings, grouped by job.">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <label htmlFor="job-filter" className="sr-only">Filter by job</label>
        <select id="job-filter" className="input sm:w-72" value={jobFilter} onChange={(e) => setParam("job", e.target.value)}>
          <option value="">All listings</option>
          {jobs.map(([id, t]) => <option key={id} value={id}>{t}</option>)}
        </select>
        <div role="tablist" aria-label="Filter by status" className="-mx-1 flex gap-1 overflow-x-auto px-1">
          <button role="tab" aria-selected={!statusFilter} onClick={() => setParam("status", "")} className={cn("shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold", !statusFilter ? "bg-navy-800 text-white" : "bg-white text-navy-600 ring-1 ring-navy-100")}>All</button>
          {(Object.keys(APPLICATION_STATUS_LABEL) as ApplicationStatus[]).map((s) => (
            <button key={s} role="tab" aria-selected={statusFilter === s} onClick={() => setParam("status", s)} className={cn("shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold", statusFilter === s ? "bg-navy-800 text-white" : "bg-white text-navy-600 ring-1 ring-navy-100")}>
              {APPLICATION_STATUS_LABEL[s]} {statusCounts[s] ? <span className="opacity-60">{statusCounts[s]}</span> : null}
            </button>
          ))}
        </div>
      </div>
      {loading ? (
        <Skeleton className="h-48" />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !grouped.length ? (
        <EmptyState icon={Inbox} title="No applicants match" body={apps?.length ? "Try a different filter." : "When teens apply to your listings, they'll show up here automatically."} />
      ) : (
        <div className="space-y-6">
          {grouped.map(([jobId, g]) => (
            <section key={jobId} aria-labelledby={`g-${jobId}`} className="card overflow-hidden">
              <div className="flex items-center justify-between border-b border-navy-50 bg-cream-100/60 px-5 py-3">
                <h2 id={`g-${jobId}`} className="font-bold">{g.title}</h2>
                <span className="text-xs font-medium text-navy-500">{g.items.length} applicant{g.items.length === 1 ? "" : "s"}</span>
              </div>
              <ul className="divide-y divide-navy-50">
                {g.items.map((a) => (
                  <li key={a.id}>
                    <Link href={`/dashboard/employer/applications/${a.id}`} className="flex flex-col gap-1 px-5 py-4 hover:bg-cream-100 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="font-semibold">
                          {a.applicant_name}
                          {a.status === "submitted" && <span className="ml-2 rounded-full bg-coral-500 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">New</span>}
                        </p>
                        <p className="truncate text-sm text-navy-500">{a.age_range} · {a.city} · {a.skills.slice(0, 3).join(", ")} · {timeAgo(a.created_at)}</p>
                      </div>
                      <StatusBadge status={a.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </EmployerShell>
  );
}

export default function Page() {
  return <Suspense><Applicants /></Suspense>;
}
