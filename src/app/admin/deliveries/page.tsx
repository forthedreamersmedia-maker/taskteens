"use client";
import { MailWarning } from "lucide-react";
import { AdminShell } from "@/components/dashboard/admin-shell";
import { RequiresBackend } from "@/components/safety/demo-notice";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { isDemoMode } from "@/lib/config";
import { must, safetySupabase, useSafetyQuery } from "@/lib/safety/client";
import { formatDateTime } from "@/lib/utils";

interface Row { id: string; channel: string; status: string; attempts: number; last_error: string | null; created_at: string; sent_at: string | null; notification: { title: string; kind: string } | null; user: { email: string; role: string } | null }

/** Delivery log: shows failures truthfully and lets an admin retry. */
export default function DeliveriesPage() {
  const toast = useToast();
  const q = useSafetyQuery(async (sb) => must(await sb.from("notification_deliveries").select("id,channel,status,attempts,last_error,created_at,sent_at,notification:notifications(title,kind),user:users(email,role)").order("created_at", { ascending: false }).limit(200)) as unknown as Row[], []);
  if (isDemoMode) return <AdminShell title="Email & SMS delivery"><RequiresBackend feature="Delivery logs" /></AdminShell>;
  const failed = q.data?.filter((r) => r.status === "failed" || r.status === "skipped").length ?? 0;
  return (
    <AdminShell title="Email & SMS delivery" subtitle="Every email/SMS TaskTeens tried to send. Failed and skipped messages were NOT received.">
      {failed > 0 && <p className="mb-3 text-sm font-semibold text-coral-700">{failed} not delivered in the latest 200.</p>}
      {q.loading && !q.data ? <Skeleton className="h-40" /> : q.error ? <ErrorState message={q.error} onRetry={q.reload} /> : !q.data!.length ? <EmptyState icon={MailWarning} title="No deliveries yet" /> : (
        <ul className="divide-y divide-navy-50 overflow-hidden rounded-3xl border border-navy-100 bg-white text-sm">
          {q.data!.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <div className="min-w-0">
                <p className="font-medium">{r.notification?.title ?? "—"} <span className="text-xs text-navy-400">({r.notification?.kind})</span></p>
                <p className="text-xs text-navy-500">{r.channel.toUpperCase()} → {r.user?.email} ({r.user?.role}) · {formatDateTime(r.created_at)} · {r.attempts} attempt{r.attempts === 1 ? "" : "s"}{r.last_error ? ` · ${r.last_error}` : ""}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={r.status === "sent" ? "green" : r.status === "pending" || r.status === "sending" ? "amber" : "coral"}>{r.status}</Badge>
                {(r.status === "failed" || r.status === "skipped") && (
                  <button className="btn-outline btn-sm" onClick={async () => { const { error } = await safetySupabase()!.rpc("admin_retry_delivery", { p_id: r.id }); if (error) toast({ tone: "error", title: "Couldn't retry", body: error.message }); else { await fetch("/api/notifications/dispatch", { method: "POST" }); toast({ tone: "success", title: "Retry queued" }); q.reload(); } }}>Retry</button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </AdminShell>
  );
}
