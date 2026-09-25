import { MIN_REVIEWS_FOR_SCORE, RELIABLE_MIN_COMPLETED } from "./constants";
import type { EmployerRatingSummary } from "./types";

type ReviewLike = { stars: number; paid_as_promised: boolean; matched_listing: boolean; felt_safe: boolean; respectful: boolean };

/**
 * Builds the public, aggregate-only rating summary for an employer.
 * Mirrors public.employer_rating_summaries() in the ratings migration — keep the two in sync.
 */
export function summarizeEmployer(
  employer_id: string,
  publishedReviews: ReviewLike[],
  completedJobs: number,
  hasUnresolvedReports: boolean,
): EmployerRatingSummary {
  const n = publishedReviews.length;
  const show = n >= MIN_REVIEWS_FOR_SCORE;
  const pct = (k: keyof Omit<ReviewLike, "stars">) => Math.round((publishedReviews.filter((r) => r[k]).length / n) * 100);
  return {
    employer_id,
    completed_jobs: completedJobs,
    review_count: n,
    avg_stars: show ? Math.round((publishedReviews.reduce((s, r) => s + r.stars, 0) / n) * 10) / 10 : null,
    pct_paid: show ? pct("paid_as_promised") : null,
    pct_matched: show ? pct("matched_listing") : null,
    pct_respectful: show ? pct("respectful") : null,
    pct_safe: show ? pct("felt_safe") : null,
    reliable: completedJobs >= RELIABLE_MIN_COMPLETED && !hasUnresolvedReports,
  };
}

export const REVIEW_DISPUTE_REASONS = [
  "Harassment or abusive content",
  "Retaliation",
  "False claim — this didn't happen",
  "Shares personal information (doxxing)",
  "Not about this job / irrelevant",
  "Other",
];
