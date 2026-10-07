"use client";
import { FileWarning } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { AdminShell } from "@/components/dashboard/admin-shell";
import { RequiresBackend } from "@/components/safety/demo-notice";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { isDemoMode } from "@/lib/config";
import { CLOSED, STATUS_LABEL, categoryLabel } from "@/lib/safety/incidents";
import { must, useSafetyQuery } from "@/lib/safety/client";
import { formatDateTime } from "@/lib/utils";

interface Row {
  id: string; category: string; status: string; created_at: string; job_title: string | null; reporter_role: string; reporter_name: string | null;
  teen_name: string | null; employer_name: string | null; anyone_in_danger: boolean; anyone_injured: boolean; response_open: boolean;
  statements: number; evidence: number; employer_restricted: boolean;
}

/** Incident queue. Urgent reports first. */
export default function AdminIncidents() {
  const [all, setAll] = useState(false);
  const q = useSafetyQuery(async (sb) => must(await sb.rpc("admin_incidents", { p_include_closed: all })) as Row[], [all]);
  if (isDemoMode) return <AdminShell title="Incidents"><RequiresBackend feature="Incident reports" /></AdminShell>;
  return (
    <AdminShell title="Incidents" subtitle="Structured reports from teens, parents and employers. Urgent reports first.">
      <label className="mb-4 flex items-center gap-2 text-sm"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Include closed reports</label>
      {q.loading && !q.data ? <Skeleton className="h-40" /> : q.error ? <ErrorState message={q.error} onRetry={q.reload} /> : !q.data?.length ? <EmptyState icon={FileWarning} title="No open incident reports" /> : (
        <ul className="space-y-3">
          {q.data.map((r) => (
            <li key={r.id}>
              <Link href={`/incidents/${r.id}`} className={r.status === "urgent" ? "card block border-2 border-coral-400 p-4" : "card block p-4"}>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={CLOSED.has(r.status) ? "gray" : r.status === "urgent" ? "coral" : "amber"}>{STATUS_LABEL[r.status] ?? r.status}</Badge>
                  {r.anyone_in_danger && <Badge tone="coral">Danger</Badge>}
                  {r.anyone_injured && <Badge tone="coral">Injury</Badge>}
                  {r.employer_restricted && <Badge tone="coral">Employer restricted</Badge>}
                  {r.response_open && <Badge tone="gray">Open for response</Badge>}
                  <span className="text-xs text-navy-400">{formatDateTime(r.created_at)}</span>
                </div>
                <p className="mt-2 font-semibold">{categoryLabel(r.category)}</p>
                <p className="text-sm text-navy-500">
                  {r.job_title ? `“${r.job_title}” · ` : ""}Filed by {r.reporter_name || "a"} ({r.reporter_role}){r.teen_name ? ` · teen: ${r.teen_name}` : ""}{r.employer_name ? ` · employer: ${r.employer_name}` : ""}
                </p>
                <p className="text-xs text-navy-400">{r.statements} statement{r.statements === 1 ? "" : "s"} · {r.evidence} file{r.evidence === 1 ? "" : "s"}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AdminShell>
  );
}
