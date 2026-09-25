"use client";
import { ArrowLeft, Ban, BadgeCheck, Bus, CalendarDays, CheckCircle2, Clock, ExternalLink, Info, MapPin, ShieldAlert, UserRound, Users, Wallet } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Badge, DemoBadge, StatusBadge, VerifiedBadge } from "@/components/ui/badge";
import { EmptyState, ErrorState, PageLoader } from "@/components/ui/feedback";
import { SafeImage } from "@/components/ui/image";
import { useToast } from "@/components/ui/toast";
import { ReportButton } from "@/components/safety/report-dialog";
import { JobGrid, SaveButton } from "./job-card";
import { useSavedJobs } from "./use-saved-jobs";
import { useAuth } from "@/lib/auth-context";
import { useAsync } from "@/lib/hooks/use-async";
import { PAY_TYPE_LABEL, RECURRENCE_LABEL, TRANSPORTATION_LABEL, WORK_MODE_LABEL } from "@/lib/constants";
import { categoryName, daysUntil, formatDate, formatPay, safeUrl } from "@/lib/utils";

export function JobDetail({ id }: { id: string }) {
  const { data, session } = useAuth();
  const toast = useToast();
  const { data: job, loading, error, reload } = useAsync(() => data.getJob(id), [id, session?.user.id]);
  const { data: similar, loading: simLoading } = useAsync(async () => (job ? data.getSimilarJobs(job) : []), [job?.id], { enabled: !!job });
  const { data: myApp } = useAsync(() => data.getMyApplicationForJob(id), [id, session?.user.id], { enabled: session?.user.role === "teen" });
  const { saved, toggle } = useSavedJobs();
  const [blocked, setBlocked] = useState(false);

  if (loading) return <PageLoader label="Loading job…" />;
  if (error) return <div className="container-page py-16"><ErrorState message={error} onRetry={reload} /></div>;
  if (!job)
    return (
      <div className="container-page py-16">
        <EmptyState title="This listing isn't available" body="It may have been filled, paused, or removed by a moderator." action={{ label: "Browse other jobs", href: "/jobs" }} />
      </div>
    );

  const deadlineDays = daysUntil(job.deadline);
  const closed = job.status !== "published" || job.moderation_status !== "approved" || (deadlineDays !== null && deadlineDays < 0);
  const website = safeUrl(job.employer.website);
  const isOwner = session?.user.id === job.employer_id;

  const applyCta = () => {
    if (closed) return <p className="rounded-2xl bg-navy-50 px-4 py-3 text-sm font-medium text-navy-600">Applications are closed for this listing.</p>;
    if (myApp) {
      return (
        <div className="rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-900">
          <p className="flex items-center gap-2 font-semibold"><CheckCircle2 className="h-4 w-4" aria-hidden="true" /> You applied {formatDate(myApp.created_at)}</p>
          <p className="mt-2 flex items-center gap-2">Status: <StatusBadge status={myApp.status} /></p>
          <Link href="/dashboard/teen/applications" className="link mt-2 inline-block">Track in your dashboard</Link>
        </div>
      );
    }
    if (session && session.user.role !== "teen")
      return <p className="rounded-2xl bg-navy-50 px-4 py-3 text-sm text-navy-600">{isOwner ? "This is your listing." : "Only teen accounts can apply to jobs."}</p>;
    const href = session ? `/jobs/${job.id}/apply` : `/auth/sign-in?next=${encodeURIComponent(`/jobs/${job.id}/apply`)}`;
    return (
      <Link href={href} className="btn-coral btn-lg w-full">
        {session ? "Apply now" : "Sign in to apply"}
      </Link>
    );
  };

  const facts = [
    { icon: Wallet, label: "Compensation", value: `${formatPay(job)} · ${PAY_TYPE_LABEL[job.pay_type]}` },
    { icon: MapPin, label: "Location", value: job.work_mode === "remote" ? "Remote" : `${job.neighborhood ? `${job.neighborhood}, ` : ""}${job.city}`, sub: job.work_mode !== "remote" ? "Approximate area only. Exact location is shared by the employer later in the hiring process." : undefined },
    { icon: Clock, label: "Schedule", value: job.schedule, sub: `${RECURRENCE_LABEL[job.recurrence]} · ${WORK_MODE_LABEL[job.work_mode]}` },
    { icon: UserRound, label: "Minimum age", value: `${job.min_age}+` },
    { icon: CalendarDays, label: "Start date", value: formatDate(job.start_date) },
    { icon: Users, label: "Openings", value: String(job.openings) },
  ];

  return (
    <div className="container-page py-8 lg:py-12">
      <Link href="/jobs" className="inline-flex items-center gap-1.5 text-sm font-medium text-navy-500 hover:text-navy-800">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All jobs
      </Link>

      {job.moderation_status !== "approved" && (isOwner || session?.user.role === "admin") && (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Preview — this listing is <strong>{job.moderation_status === "pending" ? "awaiting moderator review" : "not approved"}</strong> and is not visible to the public.
        </div>
      )}

      <div className="mt-5 grid gap-8 lg:grid-cols-[1fr_360px]">
        <article className="min-w-0">
          <div className="relative overflow-hidden rounded-4xl">
            <SafeImage src={job.image_url} alt={`Cover image for ${job.title}`} fallbackLabel={categoryName(job.category)} className="aspect-[21/9] w-full" />
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <Badge tone="cream">{categoryName(job.category)}</Badge>
            <Badge tone={job.recurrence === "recurring" ? "blue" : "coral"}>{RECURRENCE_LABEL[job.recurrence]}</Badge>
            {job.is_demo && <DemoBadge />}
          </div>
          <h1 className="mt-3 text-3xl font-extrabold sm:text-4xl">{job.title}</h1>
          <p className="mt-2 flex flex-wrap items-center gap-2 text-navy-600">
            <span className="font-semibold text-navy-800">{job.employer.display_name}</span>
            <span aria-hidden="true">·</span>
            <span>{job.employer.employer_type === "business" ? "Local business" : "Individual / family"}</span>
            <VerifiedBadge status={job.employer.verification_status} />
          </p>

          <dl className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {facts.map((f) => (
              <div key={f.label} className="rounded-2xl border border-navy-100 bg-white p-4">
                <dt className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-navy-400">
                  <f.icon className="h-4 w-4" aria-hidden="true" /> {f.label}
                </dt>
                <dd className="mt-1 font-semibold text-navy-800">{f.value}</dd>
                {f.sub && <dd className="mt-0.5 text-xs text-navy-500">{f.sub}</dd>}
              </div>
            ))}
          </dl>

          <section className="mt-8" aria-labelledby="about-job">
            <h2 id="about-job" className="text-xl font-bold">About this job</h2>
            <p className="mt-3 whitespace-pre-line leading-7 text-navy-700">{job.description}</p>
          </section>

          {job.responsibilities.length > 0 && (
            <section className="mt-8" aria-labelledby="resp">
              <h2 id="resp" className="text-xl font-bold">Responsibilities</h2>
              <ul className="mt-3 space-y-2">
                {job.responsibilities.map((r) => (
                  <li key={r} className="flex gap-2.5 text-navy-700">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-bay-500" aria-hidden="true" /> {r}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {(job.required_skills.length > 0 || job.preferred_skills.length > 0) && (
            <section className="mt-8 grid gap-6 sm:grid-cols-2" aria-label="Skills">
              {job.required_skills.length > 0 && (
                <div>
                  <h2 className="text-base font-bold">Required skills</h2>
                  <div className="mt-2 flex flex-wrap gap-2">{job.required_skills.map((s) => <Badge key={s} tone="navy">{s}</Badge>)}</div>
                </div>
              )}
              {job.preferred_skills.length > 0 && (
                <div>
                  <h2 className="text-base font-bold">Nice to have</h2>
                  <div className="mt-2 flex flex-wrap gap-2">{job.preferred_skills.map((s) => <Badge key={s} tone="gray">{s}</Badge>)}</div>
                </div>
              )}
            </section>
          )}

          <section className="mt-8 rounded-3xl border border-navy-100 bg-white p-5" aria-labelledby="transport">
            <h2 id="transport" className="flex items-center gap-2 text-base font-bold"><Bus className="h-5 w-5 text-navy-400" aria-hidden="true" /> Transportation</h2>
            <p className="mt-1 font-medium text-navy-700">{TRANSPORTATION_LABEL[job.transportation]}</p>
            {job.transportation_notes && <p className="mt-1 text-sm text-navy-500">{job.transportation_notes}</p>}
          </section>

          <section className="mt-6 rounded-3xl border border-navy-100 bg-white p-5" aria-labelledby="about-employer">
            <h2 id="about-employer" className="text-base font-bold">About {job.employer.display_name}</h2>
            {job.employer.description && <p className="mt-2 text-sm leading-6 text-navy-600">{job.employer.description}</p>}
            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
              <span className="text-navy-500">Based in {job.employer.city}</span>
              {website && (
                <a href={website} target="_blank" rel="noopener noreferrer nofollow" className="link inline-flex items-center gap-1">
                  Website <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
              )}
            </div>
            <div className="mt-4 rounded-2xl bg-cream-100 p-3 text-sm">
              <p className="flex items-center gap-2 font-semibold">
                {job.employer.verification_status === "verified" ? <BadgeCheck className="h-4 w-4 text-bay-600" aria-hidden="true" /> : <Info className="h-4 w-4 text-navy-400" aria-hidden="true" />}
                Verification: {job.employer.verification_status === "verified" ? "Profile reviewed" : job.employer.verification_status === "pending" ? "Review pending" : "Not verified"}
              </p>
              <p className="mt-1 text-xs text-navy-500">
                {job.employer.verification_status === "verified"
                  ? "A TaskTeens administrator reviewed this employer's submitted profile information. This is not a background check."
                  : "This employer has not completed a TaskTeens profile review. Take extra care and follow the safety reminders."}
              </p>
            </div>
          </section>
        </article>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <div className="card p-5">
            <p className="font-display text-2xl font-bold">{formatPay(job)}</p>
            <p className="text-sm text-navy-500">{job.schedule}</p>
            {job.deadline && (
              <p className={`mt-3 text-sm font-medium ${deadlineDays !== null && deadlineDays <= 3 ? "text-coral-700" : "text-navy-600"}`}>
                Apply by {formatDate(job.deadline)}
                {deadlineDays !== null && deadlineDays >= 0 && ` · ${deadlineDays === 0 ? "today" : `${deadlineDays} day${deadlineDays === 1 ? "" : "s"} left`}`}
              </p>
            )}
            <div className="mt-4 space-y-2">
              {applyCta()}
              {(!session || session.user.role === "teen") && <SaveButton saved={saved.has(job.id)} onToggle={() => toggle(job.id)} className="w-full justify-center py-2.5 text-sm" />}
            </div>
          </div>

          <div className="rounded-3xl border border-coral-200 bg-coral-50 p-5">
            <h2 className="flex items-center gap-2 font-bold text-coral-900"><ShieldAlert className="h-5 w-5" aria-hidden="true" /> Safety reminders</h2>
            <ul className="mt-3 space-y-2 text-sm text-coral-900/90">
              <li>• Tell a parent or guardian about the job before you start.</li>
              <li>• Meet for interviews over video or in a public place.</li>
              <li>• Never share your SSN, bank login or ID through TaskTeens.</li>
              <li>• Never pay money to get a job.</li>
              <li>• Leave and report if anything feels off.</li>
            </ul>
            <Link href="/safety" className="mt-3 inline-block text-sm font-semibold text-coral-800 underline underline-offset-2">Full safety guide</Link>
          </div>

          <div className="flex flex-wrap gap-2">
            <ReportButton targetType="job" targetId={job.id} label="Report listing" />
            {session?.user.role === "teen" && !blocked && (
              <button
                type="button"
                className="btn-ghost btn-sm text-navy-500"
                onClick={async () => {
                  await data.blockUser(job.employer_id);
                  setBlocked(true);
                  toast({ tone: "success", title: "Employer blocked", body: "You won't be able to apply to their listings and they can't contact you through TaskTeens." });
                }}
              >
                <Ban className="h-3.5 w-3.5" aria-hidden="true" /> Block employer
              </button>
            )}
          </div>
        </aside>
      </div>

      <section className="mt-16" aria-labelledby="similar">
        <h2 id="similar" className="text-2xl font-bold">Similar jobs</h2>
        <div className="mt-5">
          {!simLoading && similar?.length === 0 ? (
            <p className="text-sm text-navy-500">No similar listings right now. <Link href="/jobs" className="link">Browse all jobs</Link>.</p>
          ) : (
            <JobGrid jobs={similar} loading={simLoading} saved={saved} onToggleSave={toggle} skeletons={3} />
          )}
        </div>
      </section>
    </div>
  );
}
