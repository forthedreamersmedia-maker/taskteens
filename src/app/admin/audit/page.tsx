"use client";
import { FileClock } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/utils";
import { AdminShell } from "@/components/dashboard/admin-shell";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { useData } from "@/lib/auth-context";
import { useAsync } from "@/lib/hooks/use-async";
import { formatDateTime } from "@/lib/utils";

export default function AuditLogPage() {
  const data = useData();
  const { data: logs, loading, error, reload } = useAsync(() => data.adminListAuditLogs(), []);
  const toast = useToast();
  const [n, setN] = useState({ type: "user", id: "", note: "" });
  return (
    <AdminShell title="Audit log" subtitle="Every administrative action, newest first. Entries cannot be edited or deleted from the app.">
      <form
        className="card mb-5 grid gap-3 p-4 sm:grid-cols-[140px_1fr_2fr_auto] sm:items-end"
        onSubmit={async (e) => {
          e.preventDefault();
          if (n.note.trim().length < 3) return toast({ tone: "error", title: "Write a note first" });
          try {
            await data.adminAddNote(n.type, n.id.trim(), n.note.trim());
            setN({ ...n, id: "", note: "" });
            toast({ tone: "success", title: "Moderation note recorded" });
            reload(true);
          } catch (err) {
            toast({ tone: "error", title: "Couldn't save note", body: errorMessage(err) });
          }
        }}
      >
        <div><label htmlFor="nt" className="label">Target</label><select id="nt" className="input" value={n.type} onChange={(e) => setN({ ...n, type: e.target.value })}><option value="user">User</option><option value="job">Listing</option><option value="report">Report</option><option value="employer">Employer</option></select></div>
        <div><label htmlFor="nid" className="label">Target ID <span className="text-xs font-normal text-navy-400">Optional</span></label><input id="nid" className="input" value={n.id} onChange={(e) => setN({ ...n, id: e.target.value })} /></div>
        <div><label htmlFor="nn" className="label">Moderation note</label><input id="nn" className="input" value={n.note} onChange={(e) => setN({ ...n, note: e.target.value })} maxLength={1000} /></div>
        <button type="submit" className="btn-primary">Record</button>
      </form>
      {loading ? <Skeleton className="h-64" /> : error ? <ErrorState message={error} onRetry={reload} /> : !logs?.length ? <EmptyState icon={FileClock} title="No admin actions yet" /> : (
        <div className="overflow-x-auto rounded-3xl border border-navy-100 bg-white">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-cream-100 text-xs uppercase tracking-wide text-navy-500">
              <tr><th scope="col" className="px-4 py-3">When</th><th scope="col" className="px-4 py-3">Action</th><th scope="col" className="px-4 py-3">Target</th><th scope="col" className="px-4 py-3">Note</th></tr>
            </thead>
            <tbody className="divide-y divide-navy-50">
              {logs.map((l) => (
                <tr key={l.id}>
                  <td className="whitespace-nowrap px-4 py-3 text-navy-500">{formatDateTime(l.created_at)}</td>
                  <td className="px-4 py-3"><code className="rounded bg-navy-50 px-1.5 py-0.5 text-xs">{l.action}</code></td>
                  <td className="px-4 py-3 text-navy-600">{l.target_type}{l.target_id ? <span className="block max-w-[14rem] truncate font-mono text-xs text-navy-400">{l.target_id}</span> : null}</td>
                  <td className="px-4 py-3 text-navy-600">{l.note ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminShell>
  );
}
