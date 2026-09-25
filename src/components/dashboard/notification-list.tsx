"use client";
import { Bell, CheckCheck } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { useData } from "@/lib/auth-context";
import { useAsync } from "@/lib/hooks/use-async";
import { cn, timeAgo } from "@/lib/utils";

export function NotificationList({ limit }: { limit?: number }) {
  const data = useData();
  const { data: items, loading, error, reload } = useAsync(() => data.listNotifications(), []);
  useEffect(() => data.subscribeNotifications(() => reload(true)), [data, reload]);
  if (loading) return <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16" />)}</div>;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  const list = limit ? items!.slice(0, limit) : items!;
  if (!list.length) return <EmptyState icon={Bell} title="No notifications yet" body="Status updates, interview requests and messages from TaskTeens will show up here." />;
  const unread = items!.some((n) => !n.read_at);
  return (
    <div>
      {!limit && unread && (
        <div className="mb-3 flex justify-end">
          <button type="button" className="btn-ghost btn-sm" onClick={async () => { await data.markAllNotificationsRead(); reload(true); }}>
            <CheckCheck className="h-4 w-4" aria-hidden="true" /> Mark all as read
          </button>
        </div>
      )}
      <ul className="divide-y divide-navy-50 overflow-hidden rounded-3xl border border-navy-100 bg-white">
        {list.map((n) => (
          <li key={n.id} className={cn("flex items-start gap-3 px-5 py-4", !n.read_at && "bg-bay-50/40")}>
            <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.read_at ? "bg-navy-100" : "bg-coral-500")} aria-label={n.read_at ? "Read" : "Unread"} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{n.title}</p>
              <p className="text-sm text-navy-600">{n.body}</p>
              <div className="mt-1 flex items-center gap-3 text-xs text-navy-400">
                <span>{timeAgo(n.created_at)}</span>
                {n.link && <Link href={n.link} onClick={() => data.markNotificationRead(n.id)} className="font-semibold text-bay-600 hover:underline">Open</Link>}
                {!n.read_at && (
                  <button type="button" onClick={async () => { await data.markNotificationRead(n.id); reload(true); }} className="font-medium hover:text-navy-700">Mark read</button>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
