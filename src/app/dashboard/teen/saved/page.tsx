"use client";
import { Bookmark } from "lucide-react";
import { TeenShell } from "@/components/dashboard/teen-shell";
import { JobGrid } from "@/components/jobs/job-card";
import { useSavedJobs } from "@/components/jobs/use-saved-jobs";
import { EmptyState, ErrorState } from "@/components/ui/feedback";
import { useData } from "@/lib/auth-context";
import { useAsync } from "@/lib/hooks/use-async";

export default function SavedJobsPage() {
  const data = useData();
  const { saved, toggle, ready } = useSavedJobs();
  const { data: jobs, loading, error, reload } = useAsync(() => data.listSavedJobs(), []);
  const visible = ready ? jobs?.filter((j) => saved.has(j.id)) : jobs;
  return (
    <TeenShell title="Saved jobs" subtitle="Jobs you bookmarked to come back to.">
      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !loading && !visible?.length ? (
        <EmptyState icon={Bookmark} title="No saved jobs" body="Tap Save on any listing to keep it here." action={{ label: "Browse jobs", href: "/jobs" }} />
      ) : (
        <JobGrid jobs={visible} loading={loading} saved={saved} onToggleSave={toggle} skeletons={3} />
      )}
    </TeenShell>
  );
}
