"use client";
import { Users } from "lucide-react";
import { useState } from "react";
import { AdminShell } from "@/components/dashboard/admin-shell";
import { NoteActionModal, type PendingAction } from "@/components/dashboard/note-action";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/lib/auth-context";
import { useAsync } from "@/lib/hooks/use-async";
import { formatDate } from "@/lib/utils";

export default function AdminUsers() {
  const { data, session } = useAuth();
  const toast = useToast();
  const [q, setQ] = useState("");
  const { data: users, loading, error, reload } = useAsync(() => data.adminListUsers(q), [q]);
  const [action, setAction] = useState<PendingAction | null>(null);
  return (
    <AdminShell title="Users" subtitle="Suspend or reinstate accounts. Roles can only be changed in the database by the platform owner.">
      <label htmlFor="uq" className="sr-only">Search users</label>
      <input id="uq" className="input mb-4 sm:max-w-sm" placeholder="Search name or email…" value={q} onChange={(e) => setQ(e.target.value)} />
      {loading ? <Skeleton className="h-48" /> : error ? <ErrorState message={error} onRetry={reload} /> : !users?.length ? <EmptyState icon={Users} title="No users found" /> : (
        <div className="overflow-x-auto rounded-3xl border border-navy-100 bg-white">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-cream-100 text-xs uppercase tracking-wide text-navy-500">
              <tr><th scope="col" className="px-4 py-3">Name</th><th scope="col" className="px-4 py-3">Email</th><th scope="col" className="px-4 py-3">Role</th><th scope="col" className="px-4 py-3">Joined</th><th scope="col" className="px-4 py-3">Status</th><th scope="col" className="px-4 py-3"><span className="sr-only">Actions</span></th></tr>
            </thead>
            <tbody className="divide-y divide-navy-50">
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="px-4 py-3 font-medium">{u.full_name}</td>
                  <td className="px-4 py-3 text-navy-500">{u.email}</td>
                  <td className="px-4 py-3 capitalize">{u.role}</td>
                  <td className="px-4 py-3 text-navy-500">{formatDate(u.created_at)}</td>
                  <td className="px-4 py-3"><Badge tone={u.status === "active" ? "green" : "coral"}>{u.status}</Badge></td>
                  <td className="px-4 py-3 text-right">
                    {u.id !== session?.user.id && (u.status === "active" ? (
                      <button className="btn-danger btn-sm" onClick={() => setAction({ title: `Suspend ${u.full_name}?`, description: "They'll be signed out and their listings hidden.", confirmLabel: "Suspend", danger: true, requireNote: true, run: (n) => data.adminSetUserStatus(u.id, "suspended", n) })}>Suspend</button>
                    ) : (
                      <button className="btn-outline btn-sm" onClick={() => setAction({ title: `Reinstate ${u.full_name}?`, confirmLabel: "Reinstate", run: (n) => data.adminSetUserStatus(u.id, "active", n) })}>Reinstate</button>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <NoteActionModal action={action} onClose={() => setAction(null)} onDone={() => { setAction(null); toast({ tone: "success", title: "Account updated" }); reload(true); }} />
    </AdminShell>
  );
}
