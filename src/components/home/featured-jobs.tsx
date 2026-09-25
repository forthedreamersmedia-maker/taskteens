"use client";
import { ArrowRight, Briefcase } from "lucide-react";
import Link from "next/link";
import { JobGrid } from "@/components/jobs/job-card";
import { useSavedJobs } from "@/components/jobs/use-saved-jobs";
import { EmptyState, ErrorState } from "@/components/ui/feedback";
import { useData } from "@/lib/auth-context";
import { useAsync } from "@/lib/hooks/use-async";

export function FeaturedJobs() {
  const data = useData();
  const { data: jobs, loading, error, reload } = useAsync(() => data.getFeaturedJobs(6), []);
  const { saved, toggle } = useSavedJobs();
  const anyDemo = jobs?.some((j) => j.is_demo);
  return (
    <section className="container-page mt-24" aria-labelledby="featured-heading">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">Featured near you</p>
          <h2 id="featured-heading" className="mt-2 text-3xl font-bold sm:text-4xl">Fresh local listings</h2>
          {anyDemo && <p className="mt-2 text-sm text-navy-500">Listings marked “Demo listing” are fictional examples to show how TaskTeens works.</p>}
        </div>
        <Link href="/jobs" className="btn-outline self-start sm:self-auto">
          Browse all jobs <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
      <div className="mt-8">
        {error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : !loading && jobs?.length === 0 ? (
          <EmptyState icon={Briefcase} title="No listings yet" body="Local employers are just getting started. Check back soon — or post the first job." action={{ label: "Post a job", href: "/hire" }} />
        ) : (
          <JobGrid jobs={jobs} loading={loading} saved={saved} onToggleSave={toggle} />
        )}
      </div>
    </section>
  );
}
