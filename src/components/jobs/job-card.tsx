"use client";
import { Bookmark, BookmarkCheck, CalendarClock, MapPin, Repeat, UserRound, Wallet, Zap } from "lucide-react";
import Link from "next/link";
import { Badge, DemoBadge, VerifiedBadge } from "@/components/ui/badge";
import { SafeImage } from "@/components/ui/image";
import { Skeleton } from "@/components/ui/feedback";
import { RECURRENCE_LABEL, WORK_MODE_LABEL } from "@/lib/constants";
import type { EmployerRatingSummary, JobWithEmployer } from "@/lib/types";
import { RatingInline, useEmployerRatings } from "@/components/reviews/ratings";
import { categoryName, cn, formatPay, timeAgo } from "@/lib/utils";

export function SaveButton({ saved, onToggle, className, label }: { saved: boolean; onToggle: () => void; className?: string; label?: string }) {
  const Icon = saved ? BookmarkCheck : Bookmark;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        onToggle();
      }}
      aria-pressed={saved}
      aria-label={label ?? (saved ? "Remove from saved jobs" : "Save job")}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition",
        saved ? "border-coral-200 bg-coral-50 text-coral-700" : "border-navy-200 bg-white/95 text-navy-700 hover:border-navy-300",
        className,
      )}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      {saved ? "Saved" : "Save"}
    </button>
  );
}

export function JobCard({ job, saved, onToggleSave, rating }: { job: JobWithEmployer; saved: boolean; onToggleSave: () => void; rating?: EmployerRatingSummary }) {
  return (
    <article className="group card relative flex h-full flex-col overflow-hidden transition duration-200 hover:-translate-y-0.5 hover:shadow-lift">
      <div className="relative aspect-[16/9] overflow-hidden">
        <SafeImage src={job.image_url} alt={`Cover image for ${job.title}`} fallbackLabel={categoryName(job.category)} className="h-full w-full transition duration-500 group-hover:scale-[1.03]" />
        <div className="absolute inset-x-3 top-3 z-10 flex items-start justify-between gap-2">
          <div className="flex flex-wrap gap-1.5">
            <Badge tone="cream" className="bg-white/95 ring-0">{categoryName(job.category)}</Badge>
            {job.opportunity_type === "internship" && <Badge tone="blue" className="ring-0">Internship</Badge>}
            {job.opportunity_type === "volunteer" && <Badge tone="green" className="ring-0">Volunteer</Badge>}
            {job.is_demo && <DemoBadge />}
          </div>
          <SaveButton saved={saved} onToggle={onToggleSave} label={`${saved ? "Unsave" : "Save"} ${job.title}`} />
        </div>
      </div>
      <div className="flex flex-1 flex-col p-5">
        <div className="flex flex-wrap items-center gap-2 text-xs text-navy-500">
          <span className="font-medium text-navy-700">{job.employer.display_name}</span>
          <VerifiedBadge status={job.employer.verification_status} />
        </div>
        <RatingInline rating={rating} className="mt-1" />
        <h3 className="mt-1.5 text-lg font-bold leading-snug">
          <Link href={`/jobs/${job.id}`} className="after:absolute after:inset-0 focus:outline-none">
            {job.title}
          </Link>
        </h3>
        <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm text-navy-600">
          <div className="flex items-center gap-1.5">
            <dt className="sr-only">Location</dt>
            <MapPin className="h-4 w-4 shrink-0 text-navy-400" aria-hidden="true" />
            <dd className="truncate">{job.work_mode === "remote" ? "Remote" : job.city}</dd>
          </div>
          <div className="flex items-center gap-1.5">
            <dt className="sr-only">Pay</dt>
            <Wallet className="h-4 w-4 shrink-0 text-navy-400" aria-hidden="true" />
            <dd className="truncate font-semibold text-navy-800">{formatPay(job)}</dd>
          </div>
          <div className="col-span-2 flex items-center gap-1.5">
            <dt className="sr-only">Schedule</dt>
            <CalendarClock className="h-4 w-4 shrink-0 text-navy-400" aria-hidden="true" />
            <dd className="truncate">{job.schedule}</dd>
          </div>
          <div className="flex items-center gap-1.5">
            <dt className="sr-only">Minimum age</dt>
            <UserRound className="h-4 w-4 shrink-0 text-navy-400" aria-hidden="true" />
            <dd>Ages {job.min_age}+</dd>
          </div>
          <div className="flex items-center gap-1.5">
            <dt className="sr-only">Type</dt>
            {job.recurrence === "recurring" ? <Repeat className="h-4 w-4 shrink-0 text-navy-400" aria-hidden="true" /> : <Zap className="h-4 w-4 shrink-0 text-navy-400" aria-hidden="true" />}
            <dd>{RECURRENCE_LABEL[job.recurrence]}</dd>
          </div>
        </dl>
        <div className="mt-auto flex items-center justify-between gap-3 pt-5">
          <span className="text-xs text-navy-400">
            {job.work_mode !== "in_person" && <span className="mr-2 font-medium text-bay-600">{WORK_MODE_LABEL[job.work_mode]}</span>}
            {timeAgo(job.published_at ?? job.created_at)}
          </span>
          <Link href={`/jobs/${job.id}`} className="btn-navy btn-sm relative z-10">
            View Job
          </Link>
        </div>
      </div>
    </article>
  );
}

export function JobCardSkeleton() {
  return (
    <div className="card overflow-hidden" aria-hidden="true">
      <Skeleton className="aspect-[16/9] rounded-none" />
      <div className="space-y-3 p-5">
        <Skeleton className="h-3 w-1/3" />
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
        <div className="flex justify-end pt-2"><Skeleton className="h-8 w-24 rounded-full" /></div>
      </div>
    </div>
  );
}

export function JobGrid({ jobs, loading, saved, onToggleSave, skeletons = 6 }: { jobs?: JobWithEmployer[]; loading: boolean; saved: Set<string>; onToggleSave: (id: string) => void; skeletons?: number }) {
  const ratings = useEmployerRatings((jobs ?? []).map((j) => j.employer_id));
  return (
    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3" aria-busy={loading}>
      {loading
        ? Array.from({ length: skeletons }).map((_, i) => <JobCardSkeleton key={i} />)
        : jobs?.map((j) => (
            <div key={j.id} className="relative">
              <JobCard job={j} saved={saved.has(j.id)} onToggleSave={() => onToggleSave(j.id)} rating={ratings[j.employer_id]} />
            </div>
          ))}
    </div>
  );
}
