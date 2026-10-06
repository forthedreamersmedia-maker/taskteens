"use client";
import { CheckCircle2, Clock, PauseCircle, ShieldAlert, UserPlus } from "lucide-react";
import { useState } from "react";
import { Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { useAuth } from "@/lib/auth-context";
import { isDemoMode } from "@/lib/config";
import { PARENT_STATUS_LABEL, type ParentLinkStatus } from "@/lib/safety/consent";
import { must, useSafetyQuery } from "@/lib/safety/client";
import { cn, formatDate } from "@/lib/utils";

interface Invite { parent_name: string; parent_email: string; status: string; email_status: string; created_at: string; expires_at: string }
interface Info { status: ParentLinkStatus; parents: { parent_name: string; consent_active: boolean }[]; invite: Invite | null }

const ICON = { none: UserPlus, invited: Clock, confirmed: CheckCircle2, paused: PauseCircle, revoked: ShieldAlert } as const;
const TONE = { none: "border-coral-200 bg-coral-50", invited: "border-amber-200 bg-amber-50", confirmed: "border-emerald-200 bg-emerald-50", paused: "border-amber-200 bg-amber-50", revoked: "border-coral-200 bg-coral-50" } as const;

/** Teen-facing parent/guardian status + invitation form. */
export function ParentLinkCard({ compact = false }: { compact?: boolean }) {
  const { session } = useAuth();
  const uid = session?.user.id;
  const q = useSafetyQuery<Info>(async (sb) => {
    const status = must(await sb.rpc("teen_parent_status", { p_teen: uid })) as ParentLinkStatus;
    const parents = must(await sb.rpc("my_parents")) as Info["parents"];
    const { data: inv } = await sb.from("parent_invitations").select("parent_name,parent_email,status,email_status,created_at,expires_at").order("created_at", { ascending: false }).limit(1);
    return { status: status ?? "none", parents: parents ?? [], invite: (inv?.[0] as Invite) ?? null };
  }, [uid]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "success" | "error" | "warn"; text: string } | null>(null);
  const [showForm, setShowForm] = useState(false);

  if (isDemoMode) {
    return (
      <div className={cn("card flex items-start gap-3 p-4", TONE.confirmed)}>
        <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
        <div className="text-sm"><p className="font-semibold">{PARENT_STATUS_LABEL.confirmed} (demo)</p><p className="text-navy-600">In the live app, a parent or guardian must accept an emailed invitation before you can apply.</p></div>
      </div>
    );
  }
  if (q.loading && !q.data) return <div className="card h-20 animate-pulse p-4" aria-busy="true" />;
  if (q.error) return <Alert tone="error">Couldn&apos;t load your parent status: {q.error}</Alert>;
  const info = q.data!;
  const Icon = ICON[info.status];
  const canInvite = info.status !== "confirmed" && info.status !== "paused";

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/parent-invitations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ parent_name: name, parent_email: email }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Couldn't send the invitation.");
      if (j.email === "sent") setMsg({ tone: "success", text: `Invitation emailed to ${email}. Ask them to check their inbox (and spam folder).` });
      else setMsg({ tone: "warn", text: j.email === "skipped" ? "The invitation was created, but email isn't configured on this server, so it was NOT sent." : "The invitation was created, but the email failed to send. Try again in a few minutes." });
      setShowForm(false);
      q.reload();
    } catch (err) {
      setMsg({ tone: "error", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={cn("card space-y-3 p-4 sm:p-5", TONE[info.status])} aria-label="Parent or guardian">
      <div className="flex items-start gap-3">
        <Icon className="h-5 w-5 shrink-0 text-navy-700" aria-hidden="true" />
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-semibold">{PARENT_STATUS_LABEL[info.status]}</p>
          {info.status === "confirmed" && <p className="text-navy-600">Linked: {info.parents.filter((p) => p.consent_active).map((p) => p.parent_name).join(", ")}. They approve each job before it&apos;s confirmed and can read your TaskTeens messages.</p>}
          {info.status === "paused" && <p className="text-navy-600">You can&apos;t apply to new jobs until your parent or guardian resumes your account.</p>}
          {info.status === "invited" && info.invite && (
            <p className="text-navy-600">
              Sent to {info.invite.parent_name} ({info.invite.parent_email}) on {formatDate(info.invite.created_at)} · expires {formatDate(info.invite.expires_at)}.
              {info.invite.email_status !== "sent" && <strong className="text-coral-700"> The email was not delivered ({info.invite.email_status}). Send it again.</strong>}
            </p>
          )}
          {(info.status === "none" || info.status === "revoked") && !compact && <p className="text-navy-600">A parent or guardian must confirm your account before you can apply. They&apos;ll create their own account and approve each job.</p>}
        </div>
      </div>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      {canInvite && !showForm && (
        <button type="button" className="btn-primary btn-sm" onClick={() => { setShowForm(true); setName(info.invite?.parent_name ?? ""); setEmail(info.invite?.parent_email ?? ""); }}>
          <UserPlus className="h-4 w-4" aria-hidden="true" /> {info.invite ? "Send a new invitation" : "Invite my parent or guardian"}
        </button>
      )}
      {canInvite && showForm && (
        <form onSubmit={send} noValidate className="grid gap-3 sm:grid-cols-2">
          <Field label="Parent or guardian's name" required><input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" maxLength={80} /></Field>
          <Field label="Their email" required hint="Must be their own email, not yours."><input type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" /></Field>
          <div className="flex gap-2 sm:col-span-2">
            <button type="submit" disabled={busy} className="btn-primary btn-sm">{busy ? "Sending…" : "Send invitation"}</button>
            <button type="button" className="btn-ghost btn-sm" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
          <p className="text-xs text-navy-500 sm:col-span-2">Up to 3 invitations a day. Links expire after 7 days. &ldquo;Parent confirmed&rdquo; means a parent or guardian accepted — TaskTeens does not verify ages or identities.</p>
        </form>
      )}
    </section>
  );
}
