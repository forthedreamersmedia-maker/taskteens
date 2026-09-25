"use client";
import { ClipboardList, Star } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { AdminShell } from "@/components/dashboard/admin-shell";
import { NoteActionModal, type PendingAction } from "@/components/dashboard/note-action";
import { Badge, DemoBadge } from "@/components/ui/badge";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { useData } from "@/lib/auth-context";
import { useAsync } from "@/lib/hooks/use-async";
import type { ModerationAction } from "@/lib/data";
import type { JobWithEmployer } from "@/lib/types";
import { formatPay, timeAgo } from "@/lib/utils";

export default function AdminListings() {
  const data = useData();
  const toast = useToast();
  const [moderation, setModeration] = useState("pending");
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const { data: jobs, loading, error, reload } = useAsync(() => data.adminListJobs({ moderation, status, q }), [moderation, status, q]);
  const [action, setAction] = useState<PendingAction | null>(null);

  const ask = (j: JobWithEmployer, a: ModerationAction) =>
    setAction({
      title: `${a[0]!.toUpperCase()}${a.slice(1)} “${j.title}”?`,
      confirmLabel: a[0]!.toUpperCase() + a.slice(1),
      danger: a === "remove" || a === "reject",
      requireNote: a === "remove" || a === "reject",
      run: (n) => data.adminModerateJob(j.id, a, n),
    });

  return (
    <AdminShell title="Listings moderation" subtitle="Approve, reject, pause, remove, restore and feature listings.">
      <div className="mb-5 grid gap-2 sm:grid-cols-3">
        <label className="sr-only" htmlFor="m">Moderation status</label>
        <select id="m" className="input" value={moderation} onChange={(e) => setModeration(e.target.value)}>
          <option value="">All moderation states</option><option value="pending">Awaiting review</option><option value="approved">Approved</option><option value="rejected">Rejected</option>
        </select>
        <label className="sr-only" htmlFor="s">Listing status</label>
        <select id="s" className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option><option value="published">Published</option><option value="draft">Draft</option><option value="paused">Paused</option><option value="closed">Closed</option><option value="removed">Removed</option>
        </select>
        <label className="sr-only" htmlFor="q">Search titles</label>
        <input id="q" className="input" placeholder="Search titles…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {loading ? <Skeleton className="h-48" /> : error ? <ErrorState message={error} onRetry={reload} /> : !jobs?.length ? (
        <EmptyState icon={ClipboardList} title="No listings match" />
      ) : (
        <ul className="space-y-3">
          {jobs.map((j) => (
            <li key={j.id} className="card p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/jobs/${j.id}`} className="font-semibold hover:underline">{j.title}</Link>
                    <Badge tone={j.moderation_status === "approved" ? "green" : j.moderation_status === "pending" ? "amber" : "coral"}>{j.moderation_status}</Badge>
                    <Badge tone="gray">{j.status}</Badge>
                    {j.featured && <Badge tone="blue"><Star className="h-3 w-3" aria-hidden="true" /> Featured</Badge>}
                    {j.is_demo && <DemoBadge />}
                  </div>
                  <p className="mt-0.5 text-sm text-navy-500">{j.employer.display_name} · {j.city} · {formatPay(j)} · ages {j.min_age}+ · {timeAgo(j.created_at)}</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {j.moderation_status !== "approved" && <button className="btn-primary btn-sm" onClick={() => ask(j, "approve")}>Approve</button>}
                  {j.moderation_status !== "rejected" && <button className="btn-outline btn-sm" onClick={() => ask(j, "reject")}>Reject</button>}
                  {j.status === "published" && <button className="btn-outline btn-sm" onClick={() => ask(j, "pause")}>Pause</button>}
                  {j.status !== "removed" ? <button className="btn-danger btn-sm" onClick={() => ask(j, "remove")}>Remove</button> : <button className="btn-outline btn-sm" onClick={() => ask(j, "restore")}>Restore</button>}
                  <button className="btn-ghost btn-sm" onClick={() => ask(j, j.featured ? "unfeature" : "feature")}>{j.featured ? "Unfeature" : "Feature"}</button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      <NoteActionModal action={action} onClose={() => setAction(null)} onDone={() => { setAction(null); toast({ tone: "success", title: "Listing updated", body: "Recorded in the audit log." }); reload(true); }} />
    </AdminShell>
  );
}
