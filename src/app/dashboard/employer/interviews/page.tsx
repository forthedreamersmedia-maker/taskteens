"use client";
import { CalendarCheck } from "lucide-react";
import Link from "next/link";
import { EmployerShell } from "@/components/dashboard/employer-shell";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { useData } from "@/lib/auth-context";
import { useAsync } from "@/lib/hooks/use-async";
import { formatDateTime } from "@/lib/utils";

export default function EmployerInterviews() {
  const data = useData();
  const { data: list, loading, error, reload } = useAsync(() => data.listEmployerInterviews(), []);
  return (
    <EmployerShell title="Interviews" subtitle="Requests you've sent and the times applicants confirmed.">
      {loading ? <Skeleton className="h-40" /> : error ? <ErrorState message={error} onRetry={reload} /> : !list?.length ? (
        <EmptyState icon={CalendarCheck} title="No interviews yet" body="Open an application and choose “Request interview”." action={{ label: "View applicants", href: "/dashboard/employer/applications" }} />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {list.map((i) => (
            <li key={i.id} className="card p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <Link href={`/dashboard/employer/applications/${i.application_id}`} className="font-bold hover:underline">{i.applicant_name}</Link>
                  <p className="text-sm text-navy-500">{i.job_title}</p>
                </div>
                <Badge tone={i.status === "accepted" ? "green" : i.status === "proposed" ? "amber" : "gray"} className="capitalize">{i.status === "proposed" ? "Awaiting reply" : i.status}</Badge>
              </div>
              <p className="mt-3 text-sm">{i.confirmed_time ? <strong>{formatDateTime(i.confirmed_time)}</strong> : `Offered: ${i.proposed_times.map(formatDateTime).join(" · ")}`}</p>
              <p className="mt-1 text-xs capitalize text-navy-500">{i.format.replace(/_/g, " ")}{i.location_note ? ` · ${i.location_note}` : ""}</p>
            </li>
          ))}
        </ul>
      )}
    </EmployerShell>
  );
}
