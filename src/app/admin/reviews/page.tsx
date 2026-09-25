"use client";
import { EyeOff, Lock, Star } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { AdminShell } from "@/components/dashboard/admin-shell";
import { NoteActionModal, type PendingAction } from "@/components/dashboard/note-action";
import { StarDisplay } from "@/components/reviews/ratings";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { useData } from "@/lib/auth-context";
import { useAsync } from "@/lib/hooks/use-async";
import { cn, formatDate } from "@/lib/utils";

const yn = (v: boolean, yes: string, no: string) => (
  <span className={v ? "text-navy-600" : "font-semibold text-coral-700"}>{v ? yes : no}</span>
);

function ReviewsAdmin() {
  const data = useData();
  const toast = useToast();
  const focus = useSearchParams().get("review");
  const [tab, setTab] = useState<"reviews" | "feedback">("reviews");
  const [action, setAction] = useState<PendingAction | null>(null);
  const { data: reviews, loading, error, reload } = useAsync(() => data.adminListReviews(), []);
  const { data: feedback, loading: fbLoading } = useAsync(() => data.adminListTeenFeedback(), []);

  const sorted = [...(reviews ?? [])].sort((a, b) => (a.id === focus ? -1 : b.id === focus ? 1 : b.created_at.localeCompare(a.created_at)));

  return (
    <AdminShell title="Ratings & feedback" subtitle="Public employer ratings (shown only as aggregates) and private feedback about teens.">
      <div role="tablist" className="mb-4 inline-flex rounded-full bg-white p-1 ring-1 ring-navy-100">
        {([["reviews", "Employer ratings"], ["feedback", "Private teen feedback"]] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cn("rounded-full px-4 py-1.5 text-sm font-medium", tab === k ? "bg-navy-800 text-white" : "text-navy-600 hover:bg-navy-50")}>{l}</button>
        ))}
      </div>

      {tab === "reviews" ? (
        loading ? <Skeleton className="h-48" /> : error ? <ErrorState message={error} onRetry={reload} /> : !sorted.length ? (
          <EmptyState icon={Star} title="No ratings yet" body="Ratings appear after teens complete jobs." />
        ) : (
          <ul className="space-y-3">
            {sorted.map((r) => (
              <li key={r.id} className={cn("card p-5", r.id === focus && "ring-2 ring-coral-300", r.status === "hidden" && "opacity-75")}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="flex items-center gap-2 font-bold"><StarDisplay value={r.stars} /> {r.employer_name}</p>
                    <p className="text-sm text-navy-500">{r.job_title} · by {r.teen_name} · {formatDate(r.created_at)}</p>
                  </div>
                  <div className="flex gap-1.5">
                    {r.id === focus && <Badge tone="coral">Disputed</Badge>}
                    <Badge tone={r.status === "published" ? "green" : "gray"} className="capitalize">{r.status}</Badge>
                  </div>
                </div>
                <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm">
                  {yn(r.paid_as_promised, "Paid as promised", "Not paid as promised")}
                  {yn(r.matched_listing, "Matched listing", "Didn't match listing")}
                  {yn(r.respectful, "Respectful", "Not respectful")}
                  {yn(r.felt_safe, "Felt safe", "Didn't feel safe")}
                </p>
                {r.private_note && (
                  <p className="mt-2 flex gap-2 rounded-xl bg-cream-100 p-2.5 text-sm"><Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-navy-400" aria-hidden="true" /> <span className="whitespace-pre-line">{r.private_note}</span></p>
                )}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {r.status === "published" ? (
                    <button className="btn-outline btn-sm" onClick={() => setAction({ title: "Hide this rating?", description: "It will stop counting toward the employer's public score.", confirmLabel: "Hide rating", danger: true, requireNote: true, run: (n) => data.adminSetReviewStatus(r.id, "hidden", n) })}>
                      <EyeOff className="h-3.5 w-3.5" aria-hidden="true" /> Hide
                    </button>
                  ) : (
                    <button className="btn-outline btn-sm" onClick={() => setAction({ title: "Restore this rating?", confirmLabel: "Restore", requireNote: true, run: (n) => data.adminSetReviewStatus(r.id, "published", n) })}>Restore</button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )
      ) : fbLoading ? <Skeleton className="h-48" /> : !feedback?.length ? (
        <EmptyState icon={Lock} title="No private feedback yet" body="Employers can send private feedback after a job is marked completed." />
      ) : (
        <div className="overflow-x-auto rounded-3xl border border-navy-100 bg-white">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-cream-100 text-xs uppercase tracking-wide text-navy-500">
              <tr><th className="px-4 py-3">Teen</th><th className="px-4 py-3">Employer / job</th><th className="px-4 py-3">Showed up</th><th className="px-4 py-3">Communicated</th><th className="px-4 py-3">Completed</th><th className="px-4 py-3">Note</th></tr>
            </thead>
            <tbody className="divide-y divide-navy-50">
              {feedback.map((f) => (
                <tr key={f.id}>
                  <td className="px-4 py-3 font-medium">{f.teen_name}<div className="text-xs text-navy-400">{formatDate(f.created_at)}</div></td>
                  <td className="px-4 py-3">{f.employer_name}<div className="text-xs text-navy-500">{f.job_title}</div></td>
                  <td className="px-4 py-3">{yn(f.showed_up, "Yes", "No")}</td>
                  <td className="px-4 py-3">{yn(f.communicated, "Yes", "No")}</td>
                  <td className="px-4 py-3">{yn(f.completed_job, "Yes", "No")}</td>
                  <td className="max-w-[240px] px-4 py-3 text-navy-600">{f.note ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-4 py-3 text-xs text-navy-400">Private to TaskTeens admins. Never shown publicly or to the teen.</p>
        </div>
      )}

      <NoteActionModal action={action} onClose={() => setAction(null)} onDone={() => { setAction(null); toast({ tone: "success", title: "Rating updated" }); reload(true); }} />
    </AdminShell>
  );
}

export default function Page() {
  return (
    <Suspense>
      <ReviewsAdmin />
    </Suspense>
  );
}
