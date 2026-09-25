"use client";
import { BadgeCheck } from "lucide-react";
import { useState } from "react";
import { AdminShell } from "@/components/dashboard/admin-shell";
import { NoteActionModal, type PendingAction } from "@/components/dashboard/note-action";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { useData } from "@/lib/auth-context";
import { useAsync } from "@/lib/hooks/use-async";
import { formatDate, safeUrl } from "@/lib/utils";

export default function VerificationsPage() {
  const data = useData();
  const toast = useToast();
  const { data: list, loading, error, reload } = useAsync(() => data.adminListVerificationRequests(), []);
  const [action, setAction] = useState<PendingAction | null>(null);
  const [tab, setTab] = useState<"pending" | "reviewed">("pending");
  const shown = list?.filter((v) => (tab === "pending" ? v.status === "pending" : v.status !== "pending")) ?? [];
  return (
    <AdminShell title="Employer verification requests" subtitle="Manual profile review. Approving shows a “Verified profile” badge — it is not a background check.">
      <div className="mb-4 flex gap-2">
        {(["pending", "reviewed"] as const).map((t) => <button key={t} onClick={() => setTab(t)} aria-pressed={tab === t} className={tab === t ? "btn-navy btn-sm capitalize" : "btn-outline btn-sm capitalize"}>{t}</button>)}
      </div>
      {loading ? <Skeleton className="h-40" /> : error ? <ErrorState message={error} onRetry={reload} /> : !shown.length ? (
        <EmptyState icon={BadgeCheck} title={tab === "pending" ? "No pending requests" : "No reviewed requests"} />
      ) : (
        <ul className="space-y-4">
          {shown.map((v) => {
            const site = safeUrl(v.submitted_info.website);
            return (
              <li key={v.id} className="card p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-lg font-bold">{v.employer_name}</p>
                    <p className="text-sm capitalize text-navy-500">{v.employer_type} · submitted {formatDate(v.created_at)}</p>
                  </div>
                  <Badge tone={v.status === "approved" ? "green" : v.status === "rejected" ? "coral" : "amber"} className="capitalize">{v.status}</Badge>
                </div>
                <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                  <div><dt className="text-xs text-navy-400">Legal / registered name</dt><dd>{v.submitted_info.legal_name}</dd></div>
                  {v.submitted_info.business_registration && <div><dt className="text-xs text-navy-400">Registration</dt><dd>{v.submitted_info.business_registration}</dd></div>}
                  {site && <div><dt className="text-xs text-navy-400">Website</dt><dd><a className="link" href={site} target="_blank" rel="noopener noreferrer nofollow">{site}</a></dd></div>}
                  {v.submitted_info.notes && <div className="sm:col-span-2"><dt className="text-xs text-navy-400">Notes</dt><dd>{v.submitted_info.notes}</dd></div>}
                  {v.review_note && <div className="sm:col-span-2"><dt className="text-xs text-navy-400">Review note</dt><dd>{v.review_note}</dd></div>}
                </dl>
                {v.status === "pending" && (
                  <div className="mt-4 flex gap-2">
                    <button className="btn-primary btn-sm" onClick={() => setAction({ title: `Approve ${v.employer_name}?`, description: "Their listings will show a Verified profile badge.", confirmLabel: "Approve", run: (n) => data.adminReviewVerification(v.id, true, n) })}>Approve</button>
                    <button className="btn-danger btn-sm" onClick={() => setAction({ title: `Reject ${v.employer_name}?`, confirmLabel: "Reject", danger: true, requireNote: true, run: (n) => data.adminReviewVerification(v.id, false, n) })}>Reject</button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <NoteActionModal action={action} onClose={() => setAction(null)} onDone={() => { setAction(null); toast({ tone: "success", title: "Review recorded" }); reload(true); }} />
    </AdminShell>
  );
}
