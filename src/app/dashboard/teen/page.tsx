"use client";
import { ArrowRight, Bookmark, CalendarCheck, FileText, Sparkles } from "lucide-react";
import Link from "next/link";
import { TeenShell } from "@/components/dashboard/teen-shell";
import { NotificationList } from "@/components/dashboard/notification-list";
import { Section, StatCard } from "@/components/layout/dashboard-shell";
import { JobGrid } from "@/components/jobs/job-card";
import { useSavedJobs } from "@/components/jobs/use-saved-jobs";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState, Skeleton } from "@/components/ui/feedback";
import { useAuth } from "@/lib/auth-context";
import { useAsync } from "@/lib/hooks/use-async";
import { teenProfileCompletion } from "@/lib/profile-completion";
import { formatDateTime, timeAgo } from "@/lib/utils";

export default function TeenOverview() {
  const { data, session } = useAuth();
  const { data: bundle, loading } = useAsync(async () => {
    const [profile, apps, interviews, recommended] = await Promise.all([data.getTeenProfile(), data.listMyApplications(), data.listMyInterviews(), data.getRecommendedJobs(3)]);
    return { profile, apps, interviews, recommended };
  }, []);
  const { saved, toggle } = useSavedJobs();
  const completion = teenProfileCompletion(bundle?.profile);
  const active = bundle?.apps.filter((a) => !["withdrawn", "not_selected"].includes(a.status)) ?? [];
  const upcoming = bundle?.interviews.filter((i) => i.status === "proposed" || (i.status === "accepted" && i.confirmed_time && i.confirmed_time > new Date().toISOString())) ?? [];

  return (
    <TeenShell title={`Hi, ${session?.user.full_name.split(" ")[0] ?? "there"}`} subtitle="Here's what's happening with your job search." actions={<Link href="/jobs" className="btn-primary">Find jobs</Link>}>
      {/* Profile completion */}
      <div className="card flex flex-col gap-5 p-5 sm:flex-row sm:items-center">
        <div className="relative h-20 w-20 shrink-0" role="img" aria-label={`Profile ${completion.percent}% complete`}>
          <svg viewBox="0 0 36 36" className="h-20 w-20 -rotate-90">
            <circle cx="18" cy="18" r="15.5" fill="none" stroke="#EEF2F8" strokeWidth="3.5" />
            <circle cx="18" cy="18" r="15.5" fill="none" stroke="#2F6BFF" strokeWidth="3.5" strokeLinecap="round" strokeDasharray={`${(completion.percent / 100) * 97.4} 97.4`} />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center font-display text-lg font-bold">{loading ? "…" : `${completion.percent}%`}</span>
        </div>
        <div className="flex-1">
          <h2 className="font-bold">Profile completion</h2>
          {completion.percent === 100 ? (
            <p className="text-sm text-navy-500">Your profile is complete — applications will prefill automatically.</p>
          ) : (
            <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-navy-500">
              {completion.missing.slice(0, 3).map((m) => <li key={m.key}>• {m.label}</li>)}
            </ul>
          )}
        </div>
        <Link href="/dashboard/teen/profile" className="btn-outline btn-sm self-start sm:self-center">Edit profile</Link>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Active applications" value={loading ? "–" : active.length} icon={FileText} tone="blue" />
        <StatCard label="Interviews" value={loading ? "–" : upcoming.length} icon={CalendarCheck} tone="coral" />
        <StatCard label="Saved jobs" value={saved.size} icon={Bookmark} />
        <StatCard label="Selected" value={loading ? "–" : bundle?.apps.filter((a) => a.status === "selected").length ?? 0} icon={Sparkles} tone="green" />
      </div>

      {upcoming.length > 0 && (
        <Section title="Upcoming interviews" action={<Link href="/dashboard/teen/interviews" className="link text-sm">View all</Link>}>
          <ul className="grid gap-3 sm:grid-cols-2">
            {upcoming.slice(0, 2).map((i) => (
              <li key={i.id} className="card border-coral-200 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-coral-600">{i.status === "proposed" ? "Needs your response" : "Confirmed"}</p>
                <p className="mt-1 font-semibold">{i.job_title}</p>
                <p className="text-sm text-navy-500">{i.employer_name}</p>
                <p className="mt-2 text-sm">{i.confirmed_time ? formatDateTime(i.confirmed_time) : `${i.proposed_times.length} time options offered`}</p>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Recent applications" action={<Link href="/dashboard/teen/applications" className="link text-sm">View all</Link>}>
        {loading ? (
          <Skeleton className="h-32" />
        ) : !bundle?.apps.length ? (
          <EmptyState icon={FileText} title="No applications yet" body="When you apply to a job, you'll track its status here." action={{ label: "Browse jobs", href: "/jobs" }} />
        ) : (
          <ul className="divide-y divide-navy-50 overflow-hidden rounded-3xl border border-navy-100 bg-white">
            {bundle.apps.slice(0, 4).map((a) => (
              <li key={a.id} className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <Link href={`/jobs/${a.job_id}`} className="font-semibold hover:underline">{a.job.title}</Link>
                  <p className="text-sm text-navy-500">{a.employer_name} · applied {timeAgo(a.created_at)}</p>
                </div>
                <StatusBadge status={a.status} />
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Recommended for you" action={<Link href="/jobs" className="link inline-flex items-center gap-1 text-sm">More jobs <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>}>
        {!loading && !bundle?.recommended.length ? (
          <EmptyState title="No recommendations right now" body="Add skills and your city to your profile to get better matches." />
        ) : (
          <JobGrid jobs={bundle?.recommended} loading={loading} saved={saved} onToggleSave={toggle} skeletons={3} />
        )}
      </Section>

      <Section title="Latest notifications" action={<Link href="/dashboard/teen/notifications" className="link text-sm">View all</Link>}>
        <NotificationList limit={4} />
      </Section>
    </TeenShell>
  );
}
