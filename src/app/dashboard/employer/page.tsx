"use client";
import { BadgeCheck, CalendarCheck, ClipboardList, FileEdit, Inbox, Info } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { EmployerShell } from "@/components/dashboard/employer-shell";
import { NotificationList } from "@/components/dashboard/notification-list";
import { Section, StatCard } from "@/components/layout/dashboard-shell";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState, Skeleton } from "@/components/ui/feedback";
import { useAuth } from "@/lib/auth-context";
import { RatingSummary, StarDisplay } from "@/components/reviews/ratings";
import { ReportButton } from "@/components/safety/report-dialog";
import { Badge } from "@/components/ui/badge";
import { useAsync } from "@/lib/hooks/use-async";
import { formatDateTime, timeAgo } from "@/lib/utils";

export default function EmployerOverview() {
  const { data, session } = useAuth();
  const { data: b, loading, reload } = useAsync(async () => {
    const [stats, apps, interviews, profile, reviews, ratings] = await Promise.all([
      data.getEmployerStats(), data.listEmployerApplications(), data.listEmployerInterviews(), data.getEmployerProfile(),
      data.listMyEmployerReviews(), data.getEmployerRatings(session ? [session.user.id] : []),
    ]);
    return { stats, apps, interviews, profile, reviews, rating: session ? ratings[session.user.id] : undefined };
  }, [session?.user.id]);
  useEffect(() => data.subscribeNotifications(() => reload(true)), [data, reload]);
  const s = b?.stats;
  const v = b?.profile?.verification_status;

  return (
    <EmployerShell title={b?.profile?.display_name ?? "Employer dashboard"} subtitle="Applications arrive here automatically the moment a teen applies.">
      {v && v !== "verified" && (
        <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-bay-200 bg-bay-50 p-4 text-sm text-bay-900 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2"><Info className="h-4 w-4 shrink-0" aria-hidden="true" /> {v === "pending" ? "Your profile review is pending. Your listings still work while you wait." : "Request a profile review to earn the Verified profile badge."}</p>
          {v !== "pending" && <Link href="/dashboard/employer/settings" className="btn-primary btn-sm">Request review</Link>}
        </div>
      )}
      {v === "verified" && <p className="mb-5 inline-flex items-center gap-1.5 rounded-full bg-bay-50 px-3 py-1 text-xs font-semibold text-bay-700"><BadgeCheck className="h-4 w-4" aria-hidden="true" /> Verified profile (admin-reviewed, not a background check)</p>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Active listings" value={s?.active ?? "–"} icon={ClipboardList} tone="blue" hint={s ? `${s.paused} paused` : undefined} />
        <StatCard label="Drafts" value={s?.drafts ?? "–"} icon={FileEdit} hint={s ? `${s.closed} closed` : undefined} />
        <StatCard label="Applications" value={s?.totalApplications ?? "–"} icon={Inbox} tone="coral" hint={s ? `${s.newApplications} new` : undefined} />
        <StatCard label="Interviews" value={s?.interviews ?? "–"} icon={CalendarCheck} tone="green" hint="proposed or confirmed" />
      </div>

      <Section title="Your ratings" action={<Link href="/guidelines#ratings" className="link text-sm">How ratings work</Link>}>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <RatingSummary rating={b?.rating} />
          <div className="rounded-2xl border border-navy-100 bg-white p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-navy-400">Individual ratings</p>
            {!b?.reviews.length ? (
              <p className="mt-2 text-sm text-navy-500">No ratings yet. When a teen you hired finishes a job, mark it completed on their application so they can rate it.</p>
            ) : (
              <ul className="mt-2 divide-y divide-navy-50">
                {b.reviews.slice(0, 8).map((r) => (
                  <li key={r.id} className="flex flex-col gap-1.5 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                        <StarDisplay value={r.stars} /> <span className="truncate text-navy-600">{r.job_title}</span>
                        {r.status === "hidden" && <Badge tone="gray">Hidden by moderator</Badge>}
                      </p>
                      <p className="text-xs text-navy-500">
                        {[r.paid_as_promised === null ? "Volunteer role" : r.paid_as_promised ? "Paid as promised" : "Not paid as promised", r.matched_listing ? "Matched listing" : "Didn't match listing", r.respectful ? "Respectful" : "Not respectful", r.felt_safe ? "Felt safe" : "Didn't feel safe"].join(" · ")}
                        {" · "}{new Date(r.created_at).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                      </p>
                    </div>
                    <ReportButton targetType="review" targetId={r.id} label="Dispute" />
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-[11px] leading-4 text-navy-400">Teens&apos; names aren&apos;t shown. If a rating looks like harassment, retaliation, a false claim, personal information or isn&apos;t about the job, dispute it and a moderator will review it. Contacting or pressuring a teen about a rating is against the Community Guidelines.</p>
          </div>
        </div>
      </Section>

      <Section title="Recent applicants" action={<Link href="/dashboard/employer/applications" className="link text-sm">View all</Link>}>
        {loading ? (
          <Skeleton className="h-40" />
        ) : !b?.apps.length ? (
          <EmptyState icon={Inbox} title="No applicants yet" body="Once your listing is live, applications will appear here instantly." action={{ label: "Post a job", href: "/dashboard/employer/listings/new" }} />
        ) : (
          <ul className="divide-y divide-navy-50 overflow-hidden rounded-3xl border border-navy-100 bg-white">
            {b.apps.slice(0, 5).map((a) => (
              <li key={a.id}>
                <Link href={`/dashboard/employer/applications/${a.id}`} className="flex flex-col gap-1 px-5 py-4 hover:bg-cream-100 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-semibold">{a.applicant_name} {a.status === "submitted" && <span className="ml-1 rounded-full bg-coral-500 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">New</span>}</p>
                    <p className="text-sm text-navy-500">{a.job.title} · {a.age_range} · {a.city} · {timeAgo(a.created_at)}</p>
                  </div>
                  <StatusBadge status={a.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Interview requests" action={<Link href="/dashboard/employer/interviews" className="link text-sm">View all</Link>}>
        {!b?.interviews.length ? (
          <p className="text-sm text-navy-500">No interviews scheduled. Request one from any application.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {b.interviews.slice(0, 4).map((i) => (
              <li key={i.id} className="card p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-navy-400">{i.status}</p>
                <p className="mt-1 font-semibold">{i.applicant_name}</p>
                <p className="text-sm text-navy-500">{i.job_title}</p>
                <p className="mt-2 text-sm">{i.confirmed_time ? formatDateTime(i.confirmed_time) : "Waiting for applicant to pick a time"}</p>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Notifications" action={<Link href="/dashboard/employer/notifications" className="link text-sm">View all</Link>}>
        <NotificationList limit={4} />
      </Section>
    </EmployerShell>
  );
}
