"use client";
import { AlertTriangle, Ban, Flag, Lock, MessageSquare, Send, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { RequiresBackend } from "@/components/safety/demo-notice";
import { Alert, EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/lib/auth-context";
import { isDemoMode } from "@/lib/config";
import { must, safetySupabase, useSafetyQuery } from "@/lib/safety/client";
import { checkContact } from "@/lib/safety/contact-detect";
import { cn, formatDateTime, timeAgo } from "@/lib/utils";

interface Conv {
  id: string; application_id: string; job_id: string; job_title: string; employer_id: string; employer_name: string; teen_id: string; teen_name: string;
  application_status: string; locked: boolean; blocked: boolean; last_message_at: string | null; last_body: string | null; last_sender_role: string | null; unread: number;
}
interface Msg { id: string; sender_id: string | null; sender_role: "teen" | "employer" | "parent" | "admin" | "system"; body: string; flags: string[]; delivery: "delivered" | "held"; created_at: string }

const ROLE_LABEL: Record<Msg["sender_role"], string> = { teen: "Teen", employer: "Employer", parent: "Parent/Guardian message", admin: "TaskTeens moderator", system: "TaskTeens" };
const CLOSED_FOR_EMPLOYER = ["not_selected", "withdrawn", "parent_declined", "cancelled"];

export function MessagesView({ role }: { role: "teen" | "employer" | "parent" }) {
  const { session } = useAuth();
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const selected = sp.get("c");
  const inbox = useSafetyQuery(async (sb) => (must(await sb.rpc("my_conversations")) as Conv[]) ?? [], []);
  if (isDemoMode) return <RequiresBackend feature="Messaging" />;
  if (inbox.loading && !inbox.data) return <Skeleton className="h-80" />;
  if (inbox.error) return <ErrorState message={inbox.error} onRetry={inbox.reload} />;
  const convs = inbox.data ?? [];
  if (!convs.length) return <EmptyState icon={MessageSquare} title="No conversations yet" body={role === "employer" ? "A conversation opens for every application you receive." : "A conversation opens for every job application."} />;
  const current = convs.find((c) => c.id === selected) ?? null;
  const pick = (id: string) => router.replace(`${pathname}?c=${id}`, { scroll: false });

  return (
    <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
      <ul className={cn("space-y-2", current && "hidden lg:block")} aria-label="Conversations">
        {convs.map((c) => (
          <li key={c.id}>
            <button type="button" onClick={() => pick(c.id)} aria-current={c.id === selected ? "true" : undefined}
              className={cn("w-full rounded-2xl border p-3 text-left transition", c.id === selected ? "border-bay-400 bg-bay-50" : "border-navy-100 bg-white hover:border-navy-200")}>
              <div className="flex items-center justify-between gap-2">
                <p className="truncate font-semibold">{role === "employer" ? c.teen_name : role === "parent" ? `${c.teen_name.split(" ")[0]} ↔ ${c.employer_name}` : c.employer_name}</p>
                {c.unread > 0 && <span className="rounded-full bg-coral-500 px-1.5 text-[11px] font-bold text-white">{c.unread}<span className="sr-only"> unread</span></span>}
              </div>
              <p className="truncate text-xs text-navy-500">{c.job_title}</p>
              {c.last_body && <p className="mt-1 truncate text-xs text-navy-400">{c.last_sender_role === "parent" ? "Parent: " : ""}{c.last_body}</p>}
              {c.last_message_at && <p className="text-[11px] text-navy-300">{timeAgo(c.last_message_at)}</p>}
            </button>
          </li>
        ))}
      </ul>
      {current ? <Thread key={current.id} conv={current} role={role} myId={session?.user.id ?? ""} onBack={() => router.replace(pathname, { scroll: false })} onChanged={inbox.reload} />
        : <div className="hidden rounded-3xl border border-dashed border-navy-200 p-10 text-center text-sm text-navy-500 lg:block">Choose a conversation.</div>}
    </div>
  );
}

function Thread({ conv, role, myId, onBack, onChanged }: { conv: Conv; role: "teen" | "employer" | "parent"; myId: string; onBack: () => void; onChanged: () => void }) {
  const toast = useToast();
  const [msgs, setMsgs] = useState<Msg[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const sb = safetySupabase()!;

  const load = useCallback(async () => {
    const r = await sb.from("messages").select("id,sender_id,sender_role,body,flags,delivery,created_at").eq("conversation_id", conv.id).order("created_at");
    if (r.error) setErr(r.error.message); else setMsgs(r.data as Msg[]);
    await sb.rpc("mark_conversation_read", { p_conversation: conv.id });
  }, [sb, conv.id]);

  useEffect(() => {
    load();
    const ch = sb.channel(`msgs-${conv.id}`).on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conv.id}` }, () => load()).subscribe();
    return () => { sb.removeChannel(ch); };
  }, [sb, conv.id, load]);
  useEffect(() => endRef.current?.scrollIntoView({ block: "end" }), [msgs]);

  const addressAllowed = conv.application_status === "confirmed";
  const check = checkContact(text, { addressAllowed });
  const closed = conv.locked ? "This conversation is locked while TaskTeens reviews an incident. Messages are preserved." : conv.blocked ? "Messaging is turned off because one side blocked the other." : role === "employer" && CLOSED_FOR_EMPLOYER.includes(conv.application_status) ? "This application is closed." : null;

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    try {
      const r = await fetch("/api/messages", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ conversation_id: conv.id, body: text }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Message not sent.");
      if (j.held) toast({ tone: "error", title: "Message not delivered", body: "It looks like it contains contact details. It was held for review and the teen's parent was alerted. Keep communication in TaskTeens." });
      else if (j.flags?.length) toast({ tone: "info", title: "Sent — and flagged for review", body: "It may refer to contact outside TaskTeens. The teen's parent can see it." });
      setText("");
      await load();
      onChanged();
    } catch (e2) {
      toast({ tone: "error", title: "Not sent", body: (e2 as Error).message });
    } finally { setBusy(false); }
  };

  return (
    <section className="card flex min-h-[60vh] flex-col overflow-hidden" aria-label={`Conversation about ${conv.job_title}`}>
      <header className="flex flex-wrap items-start justify-between gap-2 border-b border-navy-50 p-4">
        <div>
          <button type="button" onClick={onBack} className="mb-1 text-xs text-navy-500 lg:hidden">← All conversations</button>
          <h2 className="font-bold">{conv.job_title}</h2>
          <p className="text-xs text-navy-500">{conv.employer_name} · {conv.teen_name}</p>
          <p className="mt-1 flex items-center gap-1 text-[11px] text-navy-400"><ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> The teen&apos;s parent or guardian can read this conversation. Messages can&apos;t be deleted.</p>
        </div>
        <div className="flex gap-1.5">
          <Link href={`/report?type=application&id=${conv.application_id}`} className="btn-ghost btn-sm"><Flag className="h-4 w-4" aria-hidden="true" /> Report</Link>
          {!conv.blocked && <button type="button" className="btn-ghost btn-sm" onClick={() => setBlockOpen(true)}><Ban className="h-4 w-4" aria-hidden="true" /> Block</button>}
        </div>
      </header>
      <div className="flex-1 space-y-3 overflow-y-auto bg-cream-50/50 p-4" aria-live="polite">
        {err ? <Alert tone="error">{err}</Alert> : !msgs ? <Skeleton className="h-20" /> : !msgs.length ? <p className="text-center text-sm text-navy-400">No messages yet.</p> : msgs.map((m) => {
          const mine = m.sender_id === myId;
          return (
            <div key={m.id} className={cn("max-w-[85%]", mine ? "ml-auto" : "")}>
              <p className={cn("text-[11px] font-semibold", m.sender_role === "parent" ? "text-coral-700" : "text-navy-400", mine && "text-right")}>{mine ? (m.sender_role === "parent" ? "You · Parent/Guardian message" : "You") : ROLE_LABEL[m.sender_role]}</p>
              <div className={cn("whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm", m.delivery === "held" ? "border border-dashed border-coral-300 bg-coral-50 text-navy-700" : m.sender_role === "parent" ? "border border-coral-200 bg-white" : mine ? "bg-bay-500 text-white" : "bg-white text-navy-800")}>{m.body}</div>
              <p className={cn("mt-0.5 text-[10px] text-navy-400", mine && "text-right")}>
                {formatDateTime(m.created_at)}
                {m.delivery === "held" && <span className="ml-1 font-semibold text-coral-700">· Not delivered to the other side (contact details)</span>}
                {m.delivery !== "held" && m.flags.length > 0 && (role === "parent" || mine) && <span className="ml-1 text-amber-700">· Flagged for review</span>}
              </p>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      {closed ? (
        <p className="flex items-center gap-2 border-t border-navy-50 p-4 text-sm text-navy-500"><Lock className="h-4 w-4" aria-hidden="true" /> {closed}</p>
      ) : (
        <form onSubmit={send} className="space-y-2 border-t border-navy-50 p-3">
          {check.blocked.length > 0 && <Alert tone="error"><AlertTriangle className="mr-1 inline h-4 w-4" aria-hidden="true" />This looks like {check.blocked.join(" and ")}. It won&apos;t be delivered. {addressAllowed ? "" : "The job address is shared automatically after parent approval."}</Alert>}
          {check.blocked.length === 0 && check.flagged.length > 0 && <Alert tone="warn">This may refer to {check.flagged.join(" or ")}. It will be flagged for the parent and moderators. Please keep communication in TaskTeens.</Alert>}
          <div className="flex gap-2">
            <label htmlFor="msg" className="sr-only">Message</label>
            <textarea id="msg" className="input min-h-[44px] flex-1 resize-y" maxLength={2000} rows={2} value={text} onChange={(e) => setText(e.target.value)}
              placeholder={role === "parent" ? "Your message is labeled “Parent/Guardian message”" : "Write a message…"}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send(e as unknown as React.FormEvent); }} />
            <button type="submit" disabled={busy || !text.trim()} className="btn-primary self-end" aria-label="Send"><Send className="h-4 w-4" aria-hidden="true" /></button>
          </div>
        </form>
      )}
      <Modal open={blockOpen} onClose={() => setBlockOpen(false)} title="Block and stop messaging?" description={role === "employer" ? "You won't be able to message this teen, and they can't message you." : "The employer won't be able to message the teen or receive new applications from them. The conversation is kept for safety records."}>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={() => setBlockOpen(false)}>Cancel</button>
          <button type="button" className="btn-danger" onClick={async () => { const { error } = await sb.rpc("block_in_conversation", { p_conversation: conv.id, p_reason: null }); setBlockOpen(false); if (error) toast({ tone: "error", title: "Couldn't block", body: error.message }); else { toast({ tone: "success", title: "Blocked" }); onChanged(); } }}>Block</button>
        </div>
      </Modal>
    </section>
  );
}
