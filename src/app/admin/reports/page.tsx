"use client";
import { AlertOctagon, Flag } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { AdminShell } from "@/components/dashboard/admin-shell";
import { NoteActionModal, type PendingAction } from "@/components/dashboard/note-action";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { useData } from "@/lib/auth-context";
import { useAsync } from "@/lib/hooks/use-async";
import type { Report, ReportStatus } from "@/lib/types";
import { cn, formatDateTime } from "@/lib/utils";

export default function AdminReports() {
  const data = useData();
  const toast = useToast();
  const { data: reports, loading, error, reload } = useAsync(() => data.adminListReports(), []);
  const [filter, setFilter] = useState<"open" | "all">("open");
  const [action, setAction] = useState<PendingAction | null>(null);
  const list = reports?.filter((r) => filter === "all" || r.status === "open" || r.status === "investigating") ?? [];
  const set = (r: Report, s: ReportStatus) => setAction({ title: `Mark report as ${s}?`, description: r.reason, confirmLabel: "Save", requireNote: s === "resolved" || s === "dismissed", run: (n) => data.adminUpdateReport(r.id, s, n) });
  const targetHref = (r: Report) => (r.target_type === "job" && r.target_id ? `/jobs/${r.target_id}` : null);

  return (
    <AdminShell title="Reports & safety incidents" subtitle="Emergency reports appear first. Resolve or dismiss with a note.">
      <div className="mb-4 flex gap-2">
        <button onClick={() => setFilter("open")} aria-pressed={filter === "open"} className={filter === "open" ? "btn-navy btn-sm" : "btn-outline btn-sm"}>Open</button>
        <button onClick={() => setFilter("all")} aria-pressed={filter === "all"} className={filter === "all" ? "btn-navy btn-sm" : "btn-outline btn-sm"}>All</button>
      </div>
      {loading ? <Skeleton className="h-48" /> : error ? <ErrorState message={error} onRetry={reload} /> : !list.length ? (
        <EmptyState icon={Flag} title="No open reports" body="Nice. New reports — including emergency ones — will show up here." />
      ) : (
        <ul className="space-y-3">
          {list.map((r) => (
            <li key={r.id} className={cn("card p-5", r.severity === "emergency" && "border-coral-400 ring-2 ring-coral-200")}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  {r.severity === "emergency" && <AlertOctagon className="h-5 w-5 text-coral-600" aria-hidden="true" />}
                  <p className="font-bold">{r.reason}</p>
                </div>
                <div className="flex gap-1.5">
                  <Badge tone={r.severity === "emergency" ? "coral" : r.severity === "urgent" ? "amber" : "gray"} className="capitalize">{r.severity}</Badge>
                  <Badge tone={r.status === "open" ? "blue" : r.status === "investigating" ? "amber" : "green"} className="capitalize">{r.status}</Badge>
                </div>
              </div>
              <p className="mt-2 whitespace-pre-line text-sm text-navy-700">{r.details}</p>
              <p className="mt-2 text-xs text-navy-400">
                {formatDateTime(r.created_at)} · target: {r.target_type}
                {targetHref(r) ? <> (<Link href={targetHref(r)!} className="link">view</Link>)</> : r.target_id ? ` ${r.target_id.slice(0, 12)}…` : ""}
                {r.contact_email ? ` · contact: ${r.contact_email}` : ""} {r.reporter_id ? "· signed-in reporter" : "· anonymous"}
              </p>
              {r.resolution_note && <p className="mt-2 rounded-xl bg-cream-100 p-2 text-sm">Note: {r.resolution_note}</p>}
              <div className="mt-3 flex flex-wrap gap-1.5">
                {r.status !== "investigating" && <button className="btn-outline btn-sm" onClick={() => set(r, "investigating")}>Investigating</button>}
                {r.status !== "resolved" && <button className="btn-primary btn-sm" onClick={() => set(r, "resolved")}>Resolve</button>}
                {r.status !== "dismissed" && <button className="btn-ghost btn-sm" onClick={() => set(r, "dismissed")}>Dismiss</button>}
                {r.target_type === "job" && r.target_id && <Link href="/admin/listings" className="btn-ghost btn-sm">Moderate listing</Link>}
                {r.target_type === "user" && <Link href="/admin/users" className="btn-ghost btn-sm">Manage users</Link>}
              </div>
            </li>
          ))}
        </ul>
      )}
      <NoteActionModal action={action} onClose={() => setAction(null)} onDone={() => { setAction(null); toast({ tone: "success", title: "Report updated" }); reload(true); }} />
    </AdminShell>
  );
}
