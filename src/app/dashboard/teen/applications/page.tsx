"use client";
import { CheckCircle2, ChevronDown, FileText, Star } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { TeenShell } from "@/components/dashboard/teen-shell";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { SafeImage } from "@/components/ui/image";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { StarDisplay } from "@/components/reviews/ratings";
import { RateEmployerForm } from "@/components/reviews/review-forms";
import { useData } from "@/lib/auth-context";
import { useAsync } from "@/lib/hooks/use-async";
import { APPLICATION_STATUS_LABEL, TRANSPORTATION_LABEL } from "@/lib/constants";
import type { ApplicationStatus, ApplicationWithJob } from "@/lib/types";
import { categoryName, cn, errorMessage, formatDate, formatPay, timeAgo } from "@/lib/utils";

const FLOW: ApplicationStatus[] = ["submitted", "viewed", "interview_requested", "selected"];

function Progress({ status }: { status: ApplicationStatus }) {
  if (status === "withdrawn" || status === "not_selected")
    return <p className="text-xs text-navy-400">{status === "withdrawn" ? "You withdrew this application." : "The employer chose another applicant. Keep going — the next one could be yours."}</p>;
  const idx = FLOW.indexOf(status);
  return (
    <ol className="flex items-center gap-1" aria-label="Application progress">
      {FLOW.map((s, i) => (
        <li key={s} className="flex flex-1 flex-col gap-1">
          <span className={cn("h-1.5 rounded-full", i <= idx ? "bg-bay-500" : "bg-navy-100")} />
          <span className={cn("hidden text-[11px] sm:block", i <= idx ? "font-medium text-navy-700" : "text-navy-400")}>{APPLICATION_STATUS_LABEL[s]}</span>
          <span className="sr-only">{i <= idx ? "completed" : "not yet"}</span>
        </li>
      ))}
    </ol>
  );
}

export default function TeenApplications() {
  const data = useData();
  const toast = useToast();
  const { data: apps, loading, error, reload } = useAsync(() => data.listMyApplications(), []);
  const [filter, setFilter] = useState<"all" | "active" | "closed">("all");
  const [withdrawing, setWithdrawing] = useState<ApplicationWithJob | null>(null);
  const [busy, setBusy] = useState(false);
  const [rating, setRating] = useState<ApplicationWithJob | null>(null);
  const [completing, setCompleting] = useState<ApplicationWithJob | null>(null);
  const doneIds = (apps ?? []).filter((a) => a.completed_at).map((a) => a.id).join(",");
  const { data: reviews, reload: reloadReviews } = useAsync(async () => {
    const ids = doneIds ? doneIds.split(",") : [];
    const rows = await Promise.all(ids.map((id) => data.getMyReviewForApplication(id)));
    return Object.fromEntries(ids.map((id, i) => [id, rows[i]]));
  }, [doneIds]);
  useEffect(() => data.subscribeNotifications(() => reload(true)), [data, reload]);

  const list = (apps ?? []).filter((a) => filter === "all" || (filter === "active" ? !["withdrawn", "not_selected"].includes(a.status) : ["withdrawn", "not_selected"].includes(a.status)));

  return (
    <TeenShell title="My applications" subtitle="Status updates appear here automatically.">
      <div role="tablist" aria-label="Filter applications" className="mb-4 inline-flex rounded-full bg-white p-1 ring-1 ring-navy-100">
        {(["all", "active", "closed"] as const).map((f) => (
          <button key={f} role="tab" aria-selected={filter === f} onClick={() => setFilter(f)} className={cn("rounded-full px-4 py-1.5 text-sm font-medium capitalize", filter === f ? "bg-navy-800 text-white" : "text-navy-600 hover:bg-navy-50")}>
            {f}
          </button>
        ))}
      </div>
      {loading ? (
        <div className="space-y-3">{[0, 1].map((i) => <Skeleton key={i} className="h-36" />)}</div>
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !list.length ? (
        <EmptyState icon={FileText} title={filter === "all" ? "You haven't applied to anything yet" : "Nothing here"} body="Find a local job that fits your schedule and apply in minutes." action={{ label: "Browse jobs", href: "/jobs" }} />
      ) : (
        <ul className="space-y-4">
          {list.map((a) => (
            <li key={a.id} className="card overflow-hidden">
              <div className="flex flex-col gap-4 p-5 sm:flex-row">
                <SafeImage src={a.job.image_url} alt="" fallbackLabel={categoryName(a.job.category)} className="h-24 w-full shrink-0 rounded-2xl sm:w-36" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <Link href={`/jobs/${a.job_id}`} className="text-lg font-bold hover:underline">{a.job.title}</Link>
                      <p className="text-sm text-navy-500">{a.employer_name} · {a.job.city} · {formatPay(a.job)}</p>
                    </div>
                    <StatusBadge status={a.status} />
                  </div>
                  <div className="mt-3"><Progress status={a.status} /></div>
                  <p className="mt-2 text-xs text-navy-400">Applied {formatDate(a.created_at)} · last update {timeAgo(a.status_updated_at)}</p>
                  {a.status === "selected" && (
                    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl bg-cream-100 px-3 py-2.5 text-sm">
                      {!a.completed_at ? (
                        <>
                          <span className="text-navy-600">Finished this job?</span>
                          <button type="button" className="btn-outline btn-sm" onClick={() => setCompleting(a)}>Mark job as completed</button>
                        </>
                      ) : reviews?.[a.id] ? (
                        <span className="flex items-center gap-2 text-navy-600">
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" /> Completed {formatDate(a.completed_at)} · You rated this employer <StarDisplay value={reviews[a.id]!.stars} />
                        </span>
                      ) : (
                        <>
                          <span className="flex items-center gap-1.5 text-navy-600"><CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" /> Completed {formatDate(a.completed_at)}</span>
                          <button type="button" className="btn-coral btn-sm" onClick={() => setRating(a)}><Star className="h-4 w-4" aria-hidden="true" /> Rate this employer</button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <details className="group border-t border-navy-50 px-5 py-3 [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium text-navy-600">
                  What you submitted <ChevronDown className="h-4 w-4 transition group-open:rotate-180" aria-hidden="true" />
                </summary>
                <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                  <div><dt className="text-xs text-navy-400">Availability</dt><dd>{a.availability}</dd></div>
                  <div><dt className="text-xs text-navy-400">Transportation</dt><dd>{TRANSPORTATION_LABEL[a.transportation]}</dd></div>
                  <div className="sm:col-span-2"><dt className="text-xs text-navy-400">Why you&apos;re interested</dt><dd className="whitespace-pre-line">{a.interest_statement}</dd></div>
                  <div><dt className="text-xs text-navy-400">Skills</dt><dd>{a.skills.join(", ")}</dd></div>
                  <div><dt className="text-xs text-navy-400">Résumé</dt><dd>{a.resume_name ?? "None attached"}</dd></div>
                </dl>
                {a.status === "selected" && a.job.opportunity_type !== "volunteer" && (
                  <p className="mt-4 text-sm text-navy-600">
                    Problem getting paid for this job? <Link href={`/report/payment?job=${a.job_id}`} className="link">Report a payment issue</Link>
                  </p>
                )}
                {!["withdrawn", "not_selected", "selected"].includes(a.status) && (
                  <button type="button" onClick={() => setWithdrawing(a)} className="btn-danger btn-sm mt-4">Withdraw application</button>
                )}
              </details>
            </li>
          ))}
        </ul>
      )}
      <Modal open={!!withdrawing} onClose={() => setWithdrawing(null)} title="Withdraw this application?" description={withdrawing ? `${withdrawing.job.title} · ${withdrawing.employer_name}` : undefined} size="sm">
        <p className="text-sm text-navy-600">The employer will see that you withdrew. You can apply again later if the listing is still open.</p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn-outline" onClick={() => setWithdrawing(null)}>Keep it</button>
          <button
            type="button"
            className="btn-coral"
            disabled={busy}
            onClick={async () => {
              if (!withdrawing) return;
              setBusy(true);
              try {
                await data.withdrawApplication(withdrawing.id);
                toast({ tone: "success", title: "Application withdrawn" });
                setWithdrawing(null);
                reload(true);
              } catch (e) {
                toast({ tone: "error", title: "Couldn't withdraw", body: errorMessage(e) });
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Withdrawing…" : "Withdraw"}
          </button>
        </div>
      </Modal>
      <Modal open={!!completing} onClose={() => setCompleting(null)} title="Mark this job as completed?" description={completing ? `${completing.job.title} · ${completing.employer_name}` : undefined} size="sm">
        <p className="text-sm text-navy-600">Only mark it completed once the work is done. After that, you can rate the employer. If you haven&apos;t been paid yet, you can still <Link href="/payment-policy" className="link">report a payment problem</Link>.</p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn-outline" onClick={() => setCompleting(null)}>Not yet</button>
          <button
            type="button"
            className="btn-primary"
            disabled={busy}
            onClick={async () => {
              if (!completing) return;
              setBusy(true);
              try {
                await data.markApplicationCompleted(completing.id);
                toast({ tone: "success", title: "Marked as completed", body: "You can now rate this employer." });
                const a = completing;
                setCompleting(null);
                reload(true);
                setRating({ ...a, completed_at: new Date().toISOString(), completed_by: "teen" });
              } catch (e) {
                toast({ tone: "error", title: "Couldn't update", body: errorMessage(e) });
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Saving…" : "Yes, it's done"}
          </button>
        </div>
      </Modal>
      <Modal open={!!rating} onClose={() => setRating(null)} title="Rate this employer" description={rating ? `${rating.job.title} · ${rating.employer_name}` : undefined}>
        {rating && (
          <RateEmployerForm
            applicationId={rating.id}
            employerName={rating.employer_name}
            jobId={rating.job_id}
            volunteer={rating.job.opportunity_type === "volunteer"}
            onDone={() => {
              setRating(null);
              reloadReviews(true);
            }}
          />
        )}
      </Modal>
    </TeenShell>
  );
}
