"use client";
import { MessageSquareWarning } from "lucide-react";
import { useState } from "react";
import { AdminShell } from "@/components/dashboard/admin-shell";
import { NoteActionModal, type PendingAction } from "@/components/dashboard/note-action";
import { RequiresBackend } from "@/components/safety/demo-notice";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { isDemoMode } from "@/lib/config";
import { must, safetySupabase, useSafetyQuery } from "@/lib/safety/client";
import { formatDateTime } from "@/lib/utils";

interface Flag { id: string; source_type: string; source_id: string; conversation_id: string | null; reasons: string[]; severity: string; status: string; created_at: string; review_note: string | null }
interface Msg { id: string; body: string; sender_role: string; delivery: string; created_at: string }

/** Automatic message flags. Pattern matching is an indicator only — a person decides. */
export default function ModerationPage() {
  const toast = useToast();
  const [tab, setTab] = useState<"open" | "closed">("open");
  const [action, setAction] = useState<PendingAction | null>(null);
  const q = useSafetyQuery(async (sb) => {
    const flags = must(await sb.from("moderation_flags").select("*").order("created_at", { ascending: false }).limit(200)) as Flag[];
    const ids = flags.filter((f) => f.source_type === "message").map((f) => f.source_id);
    const msgs = ids.length ? (must(await sb.from("messages").select("id,body,sender_role,delivery,created_at").in("id", ids)) as Msg[]) : [];
    return { flags, msgs: new Map(msgs.map((m) => [m.id, m])) };
  }, []);
  if (isDemoMode) return <AdminShell title="Message flags"><RequiresBackend feature="Message moderation" /></AdminShell>;
  const sb = safetySupabase()!;
  const shown = q.data?.flags.filter((f) => (tab === "open" ? f.status === "open" : f.status !== "open")) ?? [];
  const review = (f: Flag, status: "dismissed" | "actioned", release: boolean) => setAction({
    title: release ? "Release this held message?" : status === "dismissed" ? "Dismiss flag?" : "Mark as actioned?",
    description: release ? "A copy is delivered to the other side, labeled as released by a moderator. The original record is kept." : "Recorded in the audit log.",
    confirmLabel: release ? "Release" : status === "dismissed" ? "Dismiss" : "Mark actioned", requireNote: true,
    run: async (n) => { must(await sb.rpc("admin_review_flag", { p_flag: f.id, p_status: status, p_note: n, p_release: release })); },
  });
  return (
    <AdminShell title="Message flags" subtitle="Automatic detection of possible off-platform contact. It's an indicator only and won't catch everything — you decide.">
      <div className="mb-4 flex gap-2">{(["open", "closed"] as const).map((t) => <button key={t} onClick={() => setTab(t)} aria-pressed={tab === t} className={tab === t ? "btn-navy btn-sm capitalize" : "btn-outline btn-sm capitalize"}>{t}</button>)}</div>
      {q.loading && !q.data ? <Skeleton className="h-40" /> : q.error ? <ErrorState message={q.error} onRetry={q.reload} /> : !shown.length ? <EmptyState icon={MessageSquareWarning} title="Nothing here" /> : (
        <ul className="space-y-3">
          {shown.map((f) => {
            const m = q.data!.msgs.get(f.source_id);
            return (
              <li key={f.id} className="card p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={f.severity === "held" ? "coral" : "amber"}>{f.severity === "held" ? "Held (not delivered)" : "Delivered, flagged"}</Badge>
                  {f.reasons.map((r) => <Badge key={r} tone="gray">{r.replace(/_/g, " ")}</Badge>)}
                  <span className="text-xs text-navy-400">{formatDateTime(f.created_at)}</span>
                </div>
                {m && <blockquote className="mt-2 whitespace-pre-wrap rounded-xl bg-cream-50 p-3 text-sm"><span className="text-xs font-semibold text-navy-400">{m.sender_role}: </span>{m.body}</blockquote>}
                {f.review_note && <p className="mt-2 text-xs text-navy-500">Review note: {f.review_note}</p>}
                {f.status === "open" && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button className="btn-outline btn-sm" onClick={() => review(f, "dismissed", false)}>Dismiss (false positive)</button>
                    {f.severity === "held" && <button className="btn-outline btn-sm" onClick={() => review(f, "dismissed", true)}>Dismiss &amp; release message</button>}
                    <button className="btn-danger btn-sm" onClick={() => review(f, "actioned", false)}>Actioned</button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <NoteActionModal action={action} onClose={() => setAction(null)} onDone={() => { setAction(null); toast({ tone: "success", title: "Recorded" }); q.reload(); }} />
    </AdminShell>
  );
}
