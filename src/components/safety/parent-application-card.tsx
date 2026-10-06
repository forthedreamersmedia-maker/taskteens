"use client";
import { CheckCircle2, ChevronDown, MapPin, ShieldAlert, XCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Field } from "@/components/ui/field";
import { Alert, Skeleton } from "@/components/ui/feedback";
import { Modal } from "@/components/ui/modal";
import { StatusBadge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { must, safetySupabase } from "@/lib/safety/client";
import { kickNotifications } from "@/lib/safety/kick";
import type { ParentApplication } from "@/lib/safety/parent";
import { INDICATOR_LABELS, type TrustIndicators } from "@/lib/safety/verification";
import { formatDate, formatDateTime, timeAgo } from "@/lib/utils";
import { JobTermsList, type JobTerms } from "./job-terms";

interface Detail {
  job: JobTerms & { id: string };
  employer: { display_name: string; employer_type: string };
  indicators: TrustIndicators | null;
  approvals: { decision: string; status: string; job_version: number; note: string | null; created_at: string; invalidated_reason: string | null }[];
  shifts: { starts_at: string; ends_at: string; status: string }[];
}
interface Address { line1: string; line2: string | null; city: string; state: string; postal_code: string }

const CLOSED = ["withdrawn", "not_selected", "parent_declined", "cancelled"];

export function ParentApplicationCard({ app, teenName, onChanged }: { app: ParentApplication; teenName: string; onChanged: () => void }) {
  const toast = useToast();
  const [open, setOpen] = useState(app.status === "selected");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [address, setAddress] = useState<Address | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [modal, setModal] = useState<"approve" | "decline" | "cancel" | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const sb = safetySupabase();
    if (!sb) return;
    try {
      setDetail(must(await sb.rpc("parent_application_detail", { p_application: app.id })) as Detail);
      if (app.status === "confirmed") setAddress(((must(await sb.rpc("get_job_address", { p_application: app.id })) as Address[]) ?? [])[0] ?? null);
    } catch (e) { setErr((e as Error).message); }
  }, [app.id, app.status]);
  useEffect(() => { if (open && !detail && !err) void load(); }, [open, detail, err, load]);
  const toggle = () => setOpen((o) => !o);

  const act = async () => {
    const sb = safetySupabase()!;
    setBusy(true);
    try {
      if (modal === "approve" || modal === "decline") must(await sb.rpc("parent_decide_application", { p_application: app.id, p_approve: modal === "approve", p_note: note || null }));
      else must(await sb.rpc("parent_withdraw_application", { p_application: app.id, p_note: note || null }));
      toast({ tone: "success", title: modal === "approve" ? "Job approved — it's confirmed" : modal === "decline" ? "Job declined" : "Job cancelled" });
      kickNotifications();
      setModal(null); setNote(""); setDetail(null); onChanged();
    } catch (e) {
      toast({ tone: "error", title: "That didn't work", body: (e as Error).message });
    } finally { setBusy(false); }
  };

  const awaitingModeration = detail?.job.moderation_status && detail.job.moderation_status !== "approved";
  const lastInvalidated = detail?.approvals.find((a) => a.status === "invalidated" && a.decision === "approved");

  return (
    <li className="card overflow-hidden">
      <button type="button" onClick={toggle} aria-expanded={open} className="flex w-full items-start justify-between gap-3 p-5 text-left">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-navy-400">{teenName}</p>
          <h2 className="font-bold">{app.job?.title ?? "Listing"}</h2>
          <p className="text-sm text-navy-500">{app.employer?.display_name} · {app.job?.city}{app.job?.start_date ? ` · ${formatDate(app.job.start_date)}` : ""}</p>
          <p className="mt-1 text-xs text-navy-400">Applied {formatDate(app.created_at)} · updated {timeAgo(app.status_updated_at)}</p>
        </div>
        <span className="flex items-center gap-2"><StatusBadge status={app.status} /><ChevronDown className={open ? "h-4 w-4 rotate-180 transition" : "h-4 w-4 transition"} aria-hidden="true" /></span>
      </button>
      {open && (
        <div className="space-y-4 border-t border-navy-50 p-5">
          {err ? <Alert tone="error">{err}</Alert> : !detail ? <Skeleton className="h-32" /> : (
            <>
              {app.status === "selected" && lastInvalidated && <Alert tone="warn" title="The employer changed this job">Your earlier approval no longer applies. Review the updated details below.</Alert>}
              {app.status === "selected" && awaitingModeration && <Alert tone="info">TaskTeens moderators are reviewing the latest version of this listing. You can approve once they finish.</Alert>}
              <JobTermsList t={detail.job} />
              {detail.indicators && (
                <div className="rounded-2xl bg-cream-50 p-3 text-sm">
                  <p className="font-semibold">{detail.employer.display_name} <span className="font-normal capitalize text-navy-500">· {detail.employer.employer_type}</span></p>
                  <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                    {INDICATOR_LABELS.map(({ key, label }) => <li key={key} className={detail.indicators![key] ? "text-emerald-700" : "text-navy-400"}>{detail.indicators![key] ? "✓" : "○"} {label}</li>)}
                  </ul>
                  <p className="mt-1 text-xs text-navy-500">TaskTeens does not run background checks. These show only which steps were completed.</p>
                </div>
              )}
              {app.status === "confirmed" && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm">
                  <p className="flex items-center gap-1.5 font-semibold text-emerald-900"><CheckCircle2 className="h-4 w-4" aria-hidden="true" /> You approved version {detail.job.version} of this job</p>
                  {address ? <p className="mt-1 flex items-start gap-1.5"><MapPin className="mt-0.5 h-4 w-4 text-navy-400" aria-hidden="true" />{address.line1}{address.line2 ? `, ${address.line2}` : ""}, {address.city}, {address.state} {address.postal_code}</p> : <p className="mt-1 text-navy-600">Remote job — no address.</p>}
                  {detail.shifts.filter((s) => s.status !== "cancelled").map((s) => <p key={s.starts_at} className="mt-1 text-navy-700">Scheduled {formatDateTime(s.starts_at)} – {new Date(s.ends_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</p>)}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {app.status === "selected" && (
                  <>
                    <button type="button" disabled={!!awaitingModeration} className="btn bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => setModal("approve")}><CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Approve this job</button>
                    <button type="button" className="btn-outline" onClick={() => setModal("decline")}><XCircle className="h-4 w-4" aria-hidden="true" /> Decline</button>
                  </>
                )}
                {!CLOSED.includes(app.status) && !app.completed_at && app.status !== "selected" && (
                  <button type="button" className="btn-danger btn-sm" onClick={() => setModal("cancel")}><ShieldAlert className="h-4 w-4" aria-hidden="true" /> {app.status === "confirmed" ? "Cancel this job" : "Withdraw application"}</button>
                )}
              </div>
              {detail.approvals.length > 0 && (
                <details className="text-xs text-navy-500">
                  <summary className="cursor-pointer">Approval history</summary>
                  <ul className="mt-2 space-y-1">{detail.approvals.map((a) => <li key={a.created_at}>{formatDateTime(a.created_at)} — {a.decision} version {a.job_version}{a.status === "invalidated" ? ` (no longer valid: ${a.invalidated_reason})` : ""}{a.note ? ` · “${a.note}”` : ""}</li>)}</ul>
                </details>
              )}
            </>
          )}
        </div>
      )}
      <Modal open={!!modal} onClose={() => setModal(null)} title={modal === "approve" ? `Approve this job for ${teenName}?` : modal === "decline" ? "Decline this job?" : "Cancel / withdraw?"}
        description={modal === "approve" ? "The job becomes confirmed, the exact address is shared with you and your teen, and safety tools turn on. If the employer changes the details later, you'll be asked to approve again." : modal === "decline" ? "Your teen and the employer are notified. The address stays private." : "Your teen and the employer are notified."}>
        <Field label="Note" optional hint={modal === "approve" ? "Kept with your approval record." : "Shared with TaskTeens; not sent to the employer."}><textarea className="input min-h-[60px]" maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={() => setModal(null)}>Back</button>
          <button type="button" disabled={busy} className={modal === "approve" ? "btn bg-emerald-600 text-white hover:bg-emerald-700" : "btn-danger"} onClick={act}>{busy ? "Saving…" : modal === "approve" ? "Approve" : modal === "decline" ? "Decline" : "Confirm"}</button>
        </div>
      </Modal>
    </li>
  );
}
