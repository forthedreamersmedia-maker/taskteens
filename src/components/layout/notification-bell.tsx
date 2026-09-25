"use client";
import { Bell, CheckCheck } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useAsync } from "@/lib/hooks/use-async";
import { cn, timeAgo } from "@/lib/utils";

export function NotificationBell({ light = false }: { light?: boolean }) {
  const { data, session } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { data: items = [], reload } = useAsync(() => data.listNotifications(), [session?.user.id], { enabled: !!session });

  useEffect(() => data.subscribeNotifications(() => reload(true)), [data, reload]);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const unread = items.filter((n) => !n.read_at).length;
  const hrefAll = session?.user.role === "employer" ? "/dashboard/employer/notifications" : session?.user.role === "admin" ? "/admin" : "/dashboard/teen/notifications";

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn("relative rounded-full p-2", light ? "text-white hover:bg-white/15" : "text-navy-600 hover:bg-navy-50 hover:text-navy-800")}
        aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
        aria-expanded={open}
        aria-haspopup="true"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-coral-500 px-1 text-[10px] font-bold text-white">{unread > 9 ? "9+" : unread}</span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] animate-fade-up overflow-hidden rounded-2xl border border-navy-100 bg-white shadow-lift">
          <div className="flex items-center justify-between border-b border-navy-100 px-4 py-3">
            <p className="text-sm font-semibold">Notifications</p>
            {unread > 0 && (
              <button type="button" onClick={async () => { await data.markAllNotificationsRead(); reload(true); }} className="inline-flex items-center gap-1 text-xs font-medium text-bay-600 hover:underline">
                <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" /> Mark all read
              </button>
            )}
          </div>
          <ul className="max-h-96 divide-y divide-navy-50 overflow-y-auto">
            {items.length === 0 && <li className="px-4 py-8 text-center text-sm text-navy-400">You&apos;re all caught up.</li>}
            {items.slice(0, 8).map((n) => (
              <li key={n.id}>
                <Link
                  href={n.link ?? hrefAll}
                  onClick={() => { data.markNotificationRead(n.id).then(() => reload(true)); setOpen(false); }}
                  className={cn("block px-4 py-3 hover:bg-cream-100", !n.read_at && "bg-bay-50/50")}
                >
                  <div className="flex items-start gap-2">
                    {!n.read_at && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-coral-500" aria-label="Unread" />}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-navy-800">{n.title}</p>
                      <p className="line-clamp-2 text-xs text-navy-500">{n.body}</p>
                      <p className="mt-1 text-[11px] text-navy-400">{timeAgo(n.created_at)}</p>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          <Link href={hrefAll} onClick={() => setOpen(false)} className="block border-t border-navy-100 px-4 py-2.5 text-center text-xs font-semibold text-bay-600 hover:bg-cream-100">
            View all
          </Link>
        </div>
      )}
    </div>
  );
}
