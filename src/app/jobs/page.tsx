import { Suspense } from "react";
import type { Metadata } from "next";
import { JobsExplorer } from "@/components/jobs/jobs-explorer";
import { PageLoader } from "@/components/ui/feedback";

export const metadata: Metadata = { title: "Find Jobs", description: "Search teen-friendly jobs from local families and small businesses in Berkeley, Albany, El Cerrito and the East Bay." };

export default function JobsPage() {
  return (
    <Suspense fallback={<PageLoader label="Loading jobs…" />}>
      <JobsExplorer />
    </Suspense>
  );
}
