"use client";
import { useParams } from "next/navigation";
import { EmployerShell } from "@/components/dashboard/employer-shell";
import { JobForm } from "@/components/dashboard/job-form";
import { EmptyState, PageLoader } from "@/components/ui/feedback";
import { useData } from "@/lib/auth-context";
import { useAsync } from "@/lib/hooks/use-async";

export default function EditListingPage() {
  const { id } = useParams<{ id: string }>();
  const data = useData();
  const { data: job, loading } = useAsync(() => data.getMyJob(id), [id]);
  return (
    <EmployerShell title="Edit listing" actions={<span />}>
      {loading ? <PageLoader /> : job ? <JobForm job={job} /> : <EmptyState title="Listing not found" action={{ label: "Back to listings", href: "/dashboard/employer/listings" }} />}
    </EmployerShell>
  );
}
