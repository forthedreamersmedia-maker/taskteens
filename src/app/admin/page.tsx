"use client";
import { AlertOctagon, BadgeCheck, ClipboardList, FileText, Flag, Users } from "lucide-react";
import Link from "next/link";
import { AdminShell } from "@/components/dashboard/admin-shell";
import { Section, StatCard } from "@/components/layout/dashboard-shell";
import { NotificationList } from "@/components/dashboard/notification-list";
import { Skeleton } from "@/components/ui/feedback";
import { useData } from "@/lib/auth-context";
import { useAsync } from "@/lib/hooks/use-async";
import { timeAgo } from "@/lib/utils";

export default function AdminOverview() {
  const data = useData();
  const { data: b, loading } = useAsync(async () => ({ stats: await data.adminStats(), activity: await data.adminRecentActivity() }), []);
  const s = b?.stats;
  return (
    <AdminShell title="Admin dashboard" subtitle="Moderation, safety and platform activity. Every action here is written to the audit log.">
      {!!s?.emergencyReports && (
        <Link href="/admin/reports" className="mb-5 flex items-center gap-3 rounded-2xl bg-coral-600 p-4 text-white hover:bg-coral-700">
          <AlertOctagon className="h-6 w-6" aria-hidden="true" />
          <span className="font-semibold">{s.emergencyReports} open emergency report{s.emergencyReports === 1 ? "" : "s"} — review now</span>
        </Link>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="Open reports" value={s?.openReports ?? "–"} icon={Flag} tone="coral" />
        <StatCard label="Listings awaiting review" value={s?.pendingJobs ?? "–"} icon={ClipboardList} tone="blue" />
        <StatCard label="Verification requests" value={s?.pendingVerifications ?? "–"} icon={BadgeCheck} />
        <StatCard label="Live listings" value={s?.publishedJobs ?? "–"} icon={ClipboardList} tone="green" />
        <StatCard label="Applications" value={s?.applications ?? "–"} icon={FileText} />
        <StatCard label="Users" value={s?.users ?? "–"} icon={Users} hint={s ? `${s.teens} teens · ${s.employers} employers` : undefined} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Platform activity">
          {loading ? <Skeleton className="h-64" /> : (
            <ul className="divide-y divide-navy-50 overflow-hidden rounded-3xl border border-navy-100 bg-white">
              {b?.activity.map((a, i) => (
                <li key={i} className="flex items-start justify-between gap-3 px-4 py-3 text-sm">
                  <span><span className="mr-2 rounded-full bg-navy-50 px-2 py-0.5 text-[11px] font-semibold uppercase text-navy-500">{a.kind}</span>{a.label}</span>
                  <span className="shrink-0 text-xs text-navy-400">{timeAgo(a.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title="Admin notifications"><NotificationList limit={6} /></Section>
      </div>
    </AdminShell>
  );
}
