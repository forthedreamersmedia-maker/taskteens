"use client";
import { Award, Star } from "lucide-react";
import { useState } from "react";
import { useData } from "@/lib/auth-context";
import { useAsync } from "@/lib/hooks/use-async";
import { MIN_REVIEWS_FOR_SCORE, RELIABLE_MIN_COMPLETED } from "@/lib/constants";
import type { EmployerRatingSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Batch-loads public rating summaries for a set of employers. */
export function useEmployerRatings(ids: (string | undefined | null)[]): Record<string, EmployerRatingSummary> {
  const data = useData();
  const clean = [...new Set(ids.filter(Boolean) as string[])].sort();
  const key = clean.join(",");
  const { data: ratings } = useAsync<Record<string, EmployerRatingSummary>>(async () => (clean.length ? data.getEmployerRatings(clean) : {}), [key]);
  return ratings ?? {};
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

export function ReliableBadge({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800 ring-1 ring-inset ring-emerald-200", className)}
      title={`${RELIABLE_MIN_COMPLETED}+ completed jobs · no unresolved payment or safety reports`}
    >
      <Award className="h-3.5 w-3.5" aria-hidden="true" />
      Reliable Employer
      {!compact && <span className="sr-only">: {RELIABLE_MIN_COMPLETED}+ completed jobs and no unresolved payment or safety reports</span>}
    </span>
  );
}

/** One-line rating for job cards. Renders nothing for employers with no completed jobs. */
export function RatingInline({ rating, className }: { rating?: EmployerRatingSummary; className?: string }) {
  if (!rating || rating.completed_jobs === 0) return null;
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-navy-600", className)}>
      {rating.avg_stars != null ? (
        <span className="inline-flex items-center gap-0.5 font-semibold text-navy-800">
          {rating.avg_stars.toFixed(1)} <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden="true" />
          <span className="sr-only">out of 5 stars</span>
        </span>
      ) : null}
      <span>{rating.avg_stars != null && <span aria-hidden="true">· </span>}{plural(rating.completed_jobs, "completed job")}</span>
      {rating.reliable && <ReliableBadge compact className="ml-0.5" />}
    </span>
  );
}

/** Full breakdown for the job detail page. */
export function RatingSummary({ rating }: { rating?: EmployerRatingSummary }) {
  if (!rating) return null;
  const rows: [string, number | null][] = [
    ["paid as promised", rating.pct_paid],
    ["job matched listing", rating.pct_matched],
    ["respectful", rating.pct_respectful],
    ["felt safe", rating.pct_safe],
  ];
  return (
    <div className="rounded-2xl border border-navy-100 bg-white p-4" aria-label="Employer rating from teens who completed jobs">
      <p className="text-xs font-medium uppercase tracking-wide text-navy-400">Ratings from teens who completed jobs</p>
      {rating.avg_stars != null ? (
        <>
          <p className="mt-1.5 flex flex-wrap items-center gap-2 text-lg font-bold text-navy-800">
            <span className="inline-flex items-center gap-1">
              {rating.avg_stars.toFixed(1)} <Star className="h-5 w-5 fill-amber-400 text-amber-400" aria-hidden="true" />
              <span className="sr-only">out of 5 stars</span>
            </span>
            <span className="text-sm font-medium text-navy-500">· {plural(rating.completed_jobs, "completed job")}</span>
          </p>
          <ul className="mt-2 grid gap-1 text-sm text-navy-700 sm:grid-cols-2">
            {rows.map(([label, v]) => (
              <li key={label}><span className="font-semibold">{v}%</span> {label}</li>
            ))}
          </ul>
        </>
      ) : (
        <p className="mt-1.5 text-sm text-navy-600">
          {rating.completed_jobs > 0 ? `${plural(rating.completed_jobs, "completed job")} on TaskTeens. ` : "No completed jobs on TaskTeens yet. "}
          An overall score appears after {MIN_REVIEWS_FOR_SCORE} reviews.
        </p>
      )}
      {rating.reliable && (
        <p className="mt-3 flex flex-wrap items-center gap-2 text-xs text-navy-500">
          <ReliableBadge compact /> {RELIABLE_MIN_COMPLETED}+ completed jobs · no unresolved payment or safety reports
        </p>
      )}
      <p className="mt-3 text-[11px] leading-4 text-navy-400">
        Only teens who were hired through TaskTeens can rate an employer, and only after the job is marked completed. Ratings reflect other teens&apos; experiences and aren&apos;t a background check.
      </p>
    </div>
  );
}

export function StarDisplay({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn("inline-flex", className)} aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={cn("h-4 w-4", i <= value ? "fill-amber-400 text-amber-400" : "text-navy-200")} aria-hidden="true" />
      ))}
    </span>
  );
}

const STAR_WORDS = ["", "Poor", "Fair", "Okay", "Good", "Great"];

/** Keyboard-accessible 1–5 star picker (radio group). */
export function StarInput({ value, onChange, name = "stars" }: { value: number; onChange: (v: number) => void; name?: string }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <div className="flex items-center gap-3">
      <div role="radiogroup" aria-label="Overall rating" className="flex" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((i) => (
          <label key={i} className="cursor-pointer p-0.5" onMouseEnter={() => setHover(i)}>
            <input type="radio" name={name} value={i} checked={value === i} onChange={() => onChange(i)} className="peer sr-only" aria-label={`${i} star${i > 1 ? "s" : ""} — ${STAR_WORDS[i]}`} />
            <Star className={cn("h-8 w-8 rounded transition peer-focus-visible:ring-2 peer-focus-visible:ring-bay-400", i <= shown ? "fill-amber-400 text-amber-400" : "text-navy-200")} aria-hidden="true" />
          </label>
        ))}
      </div>
      <span className="text-sm font-medium text-navy-600" aria-live="polite">{shown ? STAR_WORDS[shown] : "Tap a star"}</span>
    </div>
  );
}

/** Yes/No toggle used by review and feedback forms. */
export function YesNo({ label, value, onChange, name }: { label: string; value: boolean | null; onChange: (v: boolean) => void; name: string }) {
  return (
    <fieldset className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-navy-100 px-4 py-3">
      <legend className="sr-only">{label}</legend>
      <span className="text-sm font-medium text-navy-800" aria-hidden="true">{label}</span>
      <div className="flex gap-2">
        {([true, false] as const).map((v) => (
          <label key={String(v)} className={cn("flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-sm", value === v ? (v ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-coral-300 bg-coral-50 text-coral-800") : "border-navy-200 text-navy-600")}>
            <input type="radio" name={name} checked={value === v} onChange={() => onChange(v)} className="sr-only" />
            {v ? "Yes" : "No"}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
