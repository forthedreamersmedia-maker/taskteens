"use client";
import { FileWarning, Plus } from "lucide-react";
import Link from "next/link";
import { RequiresBackend } from "@/components/safety/demo-notice";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { useAuth } from "@/lib/auth-context";
import { isDemoMode } from "@/lib/config";
import { CLOSED, STATUS_LABEL, categoryLabel } from "@/lib/safety/incidents";
import { must, useSafetyQuery } from "@/lib/safety/client";
import { formatDateTime } from "@/lib/utils";

interface Row { id: string; category: string; status: string; created_at: string; job_title: string | null; reporter_role: string; i_am_reporter: boolean; response_open: boolean }

export default function MyIncidents() {
  const { session } = useAuth();
  const q = useSafetyQuery(async (sb) => must(await sb.rpc("my_incidents")) as Row[], [session?.user.id]);
  if (isDemoMode) return <div className="container-page py-10"><RequiresBackend feature="Incident reports" /></div>;
  return (
    <div className="container-page max-w-3xl py-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">Incident reports</h1>
          <p className="mt-1 text-sm text-navy-500">Reports you filed, and reports about jobs you were part of once TaskTeens asks for your side.</p>
        </div>
        {session?.user.role !== "admin" && <Link href="/incidents/new" className="btn-primary"><Plus className="h-4 w-4" aria-hidden="true" /> File a report</Link>}
      </div>
      {session?.user.role === "admin" && <p className="mb-4 text-sm"><Link className="link" href="/admin/incidents">Open the admin incident queue →</Link></p>}
      {q.loading && !q.data ? <Skeleton className="h-40" /> : q.error ? <ErrorState message={q.error} onRetry={q.reload} /> : !q.data?.length ? (
        <EmptyState icon={FileWarning} title="No reports" body="If something went wrong on a job, you can file a report here. In an emergency, call 911 first." />
      ) : (
        <ul className="space-y-3">
          {q.data.map((r) => (
            <li key={r.id}>
              <Link href={`/incidents/${r.id}`} className="card block p-4 hover:border-navy-200">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={CLOSED.has(r.status) ? "gray" : r.status === "urgent" ? "coral" : "amber"}>{STATUS_LABEL[r.status] ?? r.status}</Badge>
                  <span className="text-xs text-navy-400">{formatDateTime(r.created_at)}</span>
                </div>
                <p className="mt-2 font-semibold">{categoryLabel(r.category)}</p>
                <p className="text-sm text-navy-500">{r.job_title ? `“${r.job_title}” · ` : ""}{r.i_am_reporter ? "You filed this" : `Filed by the ${r.reporter_role}`}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
