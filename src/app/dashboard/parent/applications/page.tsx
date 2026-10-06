"use client";
import { FileText } from "lucide-react";
import { ParentShell } from "@/components/dashboard/parent-shell";
import { RequiresBackend } from "@/components/safety/demo-notice";
import { ParentApplicationCard } from "@/components/safety/parent-application-card";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { isDemoMode } from "@/lib/config";
import { useSafetyQuery } from "@/lib/safety/client";
import { loadMyTeens, loadTeenApplications } from "@/lib/safety/parent";

export default function ParentApplications() {
  const q = useSafetyQuery(async (sb) => ({ teens: await loadMyTeens(sb), apps: await loadTeenApplications(sb) }), []);
  if (isDemoMode) return <ParentShell title="Applications"><RequiresBackend feature="The parent dashboard" /></ParentShell>;
  const name = (id: string) => q.data?.teens.find((t) => t.teen_id === id)?.full_name.split(" ")[0] ?? "Your teen";
  const apps = [...(q.data?.apps ?? [])].sort((a, b) => Number(b.status === "selected") - Number(a.status === "selected"));
  return (
    <ParentShell title="Applications" subtitle="Jobs marked “awaiting parent approval” need your decision. Nothing is confirmed — and the address isn't shared — until you approve.">
      {q.loading && !q.data ? <Skeleton className="h-40" /> : q.error ? <ErrorState message={q.error} onRetry={q.reload} /> : !apps.length ? (
        <EmptyState icon={FileText} title="No applications yet" body="You'll be notified here (and by email) when your teen applies." />
      ) : (
        <ul className="space-y-3">{apps.map((a) => <ParentApplicationCard key={a.id} app={a} teenName={name(a.teen_id)} onChanged={q.reload} />)}</ul>
      )}
    </ParentShell>
  );
}
