"use client";
import { EmployerShell } from "@/components/dashboard/employer-shell";
import { JobForm } from "@/components/dashboard/job-form";

export default function NewListingPage() {
  return (
    <EmployerShell title="Post a job" subtitle="Clear, honest listings get better applicants." actions={<span />}>
      <JobForm />
    </EmployerShell>
  );
}
