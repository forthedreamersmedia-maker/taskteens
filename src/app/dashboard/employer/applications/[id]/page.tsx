"use client";
import { ArrowLeft, Ban, CalendarPlus, Check, ExternalLink, FileText, Lock, Mail, Phone, ThumbsDown, X } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { EmployerShell } from "@/components/dashboard/employer-shell";
import { ReportButton } from "@/components/safety/report-dialog";
import { StatusBadge } from "@/components/ui/badge";
import { Field } from "@/components/ui/field";
import { Alert, EmptyState, PageLoader } from "@/components/ui/feedback";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { useData } from "@/lib/auth-context";
import { useAsync } from "@/lib/hooks/use-async";
import { GUARDIAN_CONSENT_LABEL, TRANSPORTATION_LABEL, WORK_PERMIT_LABEL } from "@/lib/constants";
import type { ApplicationStatus, InterviewFormat } from "@/lib/types";
import { errorMessage, formatDate, formatDateTime, safeUrl, timeAgo } from "@/lib/utils";

export default function ApplicationDetail() {
  const { id } = useParams<{ id: string }>();
  const data = useData();
  const toast = useToast();
  const { data: app, loading, reload, setData } = useAsync(() => data.getEmployerApplication(id), [id]);
  const { data: notes = [], reload: reloadNotes } = useAsync(() => data.listApplicationNotes(id), [id]);
  const [note, setNote] = useState("");
  const [decision, setDecision] = useState<ApplicationStatus | null>(null);
  const [message, setMessage] = useState("");
  const [interviewOpen, setInterviewOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const viewedOnce = useRef(false);

  // Opening the application marks it as viewed (teen is notified).
  useEffect(() => {
    if (app && app.status === "submitted" && !viewedOnce.current) {
      viewedOnce.current = true;
      data.markApplicationViewed(app.id).then(() => reload(true));
    }
  }, [app, data, reload]);

  if (loading) return <EmployerShell title="Application"><PageLoader /></EmployerShell>;
  if (!app) return <EmployerShell title="Application"><EmptyState title="Application not found" body="It may belong to a different employer account." action={{ label: "All applicants", href: "/dashboard/employer/applications" }} /></EmployerShell>;

  const withdrawn = app.status === "withdrawn";
  const portfolio = safeUrl(app.portfolio_url);

  const changeStatus = async (status: ApplicationStatus, msg?: string) => {
    setBusy(true);
    try {
      await data.updateApplicationStatus(app.id, status, msg);
      setData({ ...app, status });
      toast({ tone: "success", title: "Status updated", body: "The applicant was notified." });
      setDecision(null);
      setMessage("");
      reload(true);
    } catch (e) {
      toast({ tone: "error", title: "Couldn't update status", body: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  const openResume = async () => {
    if (!app.resume_path) return;
    const url = await data.getResumeUrl(app.resume_path);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
    else toast({ tone: "info", title: "Résumé preview unavailable", body: `File: ${app.resume_name}. In demo mode, large files are stored by name only.` });
  };

  return (
    <EmployerShell title={app.applicant_name} subtitle={`Applied to “${app.job.title}” · ${timeAgo(app.created_at)}`} actions={<StatusBadge status={app.status} />}>
      <Link href={`/dashboard/employer/applications?job=${app.job_id}`} className="mb-5 inline-flex items-center gap-1.5 text-sm font-medium text-navy-500 hover:text-navy-800">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Applicants for this job
      </Link>
      {withdrawn && <Alert tone="warn" className="mb-5">The applicant withdrew this application.</Alert>}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <section className="card p-5 sm:p-6" aria-labelledby="applicant">
            <h2 id="applicant" className="text-lg font-bold">Applicant</h2>
            <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
              <div><dt className="text-xs text-navy-400">Age range</dt><dd className="font-medium">{app.age_range}</dd></div>
              <div><dt className="text-xs text-navy-400">City</dt><dd className="font-medium">{app.city}</dd></div>
              <div><dt className="text-xs text-navy-400">Email</dt><dd><a href={`mailto:${app.applicant_email}`} className="link inline-flex items-center gap-1"><Mail className="h-3.5 w-3.5" aria-hidden="true" />{app.applicant_email}</a></dd></div>
              <div><dt className="text-xs text-navy-400">Phone</dt><dd><a href={`tel:${app.applicant_phone}`} className="link inline-flex items-center gap-1"><Phone className="h-3.5 w-3.5" aria-hidden="true" />{app.applicant_phone}</a></dd></div>
              <div><dt className="text-xs text-navy-400">Availability</dt><dd>{app.availability}</dd></div>
              <div><dt className="text-xs text-navy-400">Transportation</dt><dd>{TRANSPORTATION_LABEL[app.transportation]}</dd></div>
              <div><dt className="text-xs text-navy-400">Work permit</dt><dd>{WORK_PERMIT_LABEL[app.work_permit_status]}</dd></div>
              <div><dt className="text-xs text-navy-400">Guardian consent</dt><dd>{GUARDIAN_CONSENT_LABEL[app.guardian_consent_status]}</dd></div>
            </dl>
            <p className="mt-4 flex items-center gap-1.5 text-xs text-navy-400"><Lock className="h-3.5 w-3.5" aria-hidden="true" /> Contact details are private to you. Use them only for this job.</p>
          </section>

          <section className="card space-y-4 p-5 sm:p-6" aria-labelledby="answers">
            <h2 id="answers" className="text-lg font-bold">Application</h2>
            <div><h3 className="text-xs font-semibold uppercase tracking-wide text-navy-400">Why they&apos;re interested</h3><p className="mt-1 whitespace-pre-line text-navy-700">{app.interest_statement}</p></div>
            <div><h3 className="text-xs font-semibold uppercase tracking-wide text-navy-400">Experience</h3><p className="mt-1 whitespace-pre-line text-navy-700">{app.experience}</p></div>
            <div><h3 className="text-xs font-semibold uppercase tracking-wide text-navy-400">Skills</h3><div className="mt-1 flex flex-wrap gap-1.5">{app.skills.map((s) => <span key={s} className="rounded-full bg-navy-50 px-2.5 py-0.5 text-xs font-medium">{s}</span>)}</div></div>
            <div className="flex flex-wrap gap-2 pt-2">
              {app.resume_path ? <button type="button" onClick={openResume} className="btn-outline btn-sm"><FileText className="h-4 w-4" aria-hidden="true" /> {app.resume_name ?? "Résumé"}</button> : <span className="text-sm text-navy-400">No résumé attached</span>}
              {portfolio && <a href={portfolio} target="_blank" rel="noopener noreferrer nofollow" className="btn-outline btn-sm"><ExternalLink className="h-4 w-4" aria-hidden="true" /> Portfolio</a>}
            </div>
          </section>

          <section className="card p-5 sm:p-6" aria-labelledby="notes">
            <h2 id="notes" className="flex items-center gap-2 text-lg font-bold"><Lock className="h-4 w-4 text-navy-400" aria-hidden="true" /> Private notes</h2>
            <p className="text-sm text-navy-500">Only you can see these. Applicants never do.</p>
            <ul className="mt-4 space-y-2">
              {notes.map((n) => <li key={n.id} className="rounded-2xl bg-cream-100 p-3 text-sm"><p className="whitespace-pre-line">{n.body}</p><p className="mt-1 text-xs text-navy-400">{formatDateTime(n.created_at)}</p></li>)}
            </ul>
            <form
              className="mt-3 flex flex-col gap-2 sm:flex-row"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!note.trim()) return;
                try {
                  await data.addApplicationNote(app.id, note);
                  setNote("");
                  reloadNotes(true);
                } catch (err) {
                  toast({ tone: "error", title: "Couldn't save note", body: errorMessage(err) });
                }
              }}
            >
              <label htmlFor="note" className="sr-only">Add a private note</label>
              <input id="note" className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a private note…" maxLength={2000} />
              <button type="submit" className="btn-navy whitespace-nowrap" disabled={!note.trim()}>Add note</button>
            </form>
          </section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <div className="card space-y-2 p-5">
            <h2 className="font-bold">Update status</h2>
            <p className="text-xs text-navy-500">The applicant gets an in-app notification and an email for each change.</p>
            <button type="button" disabled={withdrawn || busy} onClick={() => setInterviewOpen(true)} className="btn-primary w-full"><CalendarPlus className="h-4 w-4" aria-hidden="true" /> Request interview</button>
            <button type="button" disabled={withdrawn || busy || app.status === "selected"} onClick={() => setDecision("selected")} className="btn w-full bg-emerald-600 text-white hover:bg-emerald-700"><Check className="h-4 w-4" aria-hidden="true" /> Select applicant</button>
            <button type="button" disabled={withdrawn || busy || app.status === "not_selected"} onClick={() => setDecision("not_selected")} className="btn-outline w-full"><ThumbsDown className="h-4 w-4" aria-hidden="true" /> Decline</button>
            {app.status === "submitted" && <button type="button" disabled={busy} onClick={() => changeStatus("viewed")} className="btn-ghost w-full">Mark as viewed</button>}
          </div>
          <div className="rounded-3xl border border-navy-100 bg-white p-5 text-sm">
            <h2 className="font-bold">Before you meet</h2>
            <ul className="mt-2 space-y-1 text-navy-600">
              <li>• Video, phone or a public place only</li>
              <li>• Invite a parent or guardian</li>
              <li>• Share the exact address only after hiring</li>
            </ul>
          </div>
          <div className="flex flex-wrap gap-2">
            <ReportButton targetType="application" targetId={app.id} label="Report" />
            <button type="button" className="btn-ghost btn-sm text-navy-500" onClick={async () => { await data.blockUser(app.teen_id); toast({ tone: "success", title: "Applicant blocked", body: "They can no longer apply to your listings." }); }}>
              <Ban className="h-3.5 w-3.5" aria-hidden="true" /> Block
            </button>
          </div>
          <p className="text-xs text-navy-400">Applied {formatDate(app.created_at)}{app.viewed_at ? ` · first viewed ${formatDate(app.viewed_at)}` : ""}</p>
        </aside>
      </div>

      <Modal open={!!decision} onClose={() => setDecision(null)} title={decision === "selected" ? `Select ${app.applicant_name.split(" ")[0]}?` : "Decline this applicant?"} description="They'll be notified right away.">
        <Field label="Message to the applicant" optional hint={decision === "selected" ? "Next steps, start date, what to bring. Share an exact address only as needed." : "A short, kind note goes a long way."}>
          <textarea className="input min-h-[100px]" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={1000} />
        </Field>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn-outline" onClick={() => setDecision(null)}>Cancel</button>
          <button type="button" disabled={busy} className={decision === "selected" ? "btn bg-emerald-600 text-white hover:bg-emerald-700" : "btn-coral"} onClick={() => changeStatus(decision!, message || undefined)}>
            {busy ? "Sending…" : decision === "selected" ? "Select & notify" : "Decline & notify"}
          </button>
        </div>
      </Modal>

      <InterviewModal open={interviewOpen} onClose={() => setInterviewOpen(false)} applicationId={app.id} name={app.applicant_name} onDone={() => { setInterviewOpen(false); reload(true); }} />
    </EmployerShell>
  );
}

function InterviewModal({ open, onClose, applicationId, name, onDone }: { open: boolean; onClose: () => void; applicationId: string; name: string; onDone: () => void }) {
  const data = useData();
  const toast = useToast();
  const [times, setTimes] = useState<string[]>([""]);
  const [format, setFormat] = useState<InterviewFormat>("video");
  const [location, setLocation] = useState("");
  const [message, setMessage] = useState(`Hi ${name.split(" ")[0]}, thanks for applying! We'd like to set up a short interview. A parent or guardian is welcome to join.`);
  const [guardian, setGuardian] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const valid = times.filter(Boolean).map((t) => new Date(t));
    if (!valid.length) return setErr("Offer at least one time.");
    if (valid.some((d) => d.getTime() < Date.now())) return setErr("Times must be in the future.");
    if (format === "in_person_public" && location.trim().length < 3) return setErr("Name the public place (e.g. “Albany Library lobby”).");
    if (format === "in_person_public" && /\d{2,5}\s+\w+\s+(st|street|ave|avenue|rd|road|way|dr|drive|ct|court|ln|lane)\b/i.test(location) && !/library|cafe|café|park|store|shop|center|plaza/i.test(location))
      return setErr("In-person interviews should be in a public place, not a private residence.");
    setErr(null);
    setBusy(true);
    try {
      await data.requestInterview(applicationId, { proposed_times: valid.map((d) => d.toISOString()), format, location_note: location, message, guardian_invited: guardian });
      toast({ tone: "success", title: "Interview requested", body: `${name.split(" ")[0]} will pick a time.` });
      onDone();
    } catch (e2) {
      setErr(errorMessage(e2));
    } finally {
      setBusy(false);
    }
  };

  const minDt = new Date(Date.now() + 3600000).toISOString().slice(0, 16);
  return (
    <Modal open={open} onClose={onClose} title="Request an interview" description="Offer up to 3 times. The applicant picks one." size="lg">
      <form onSubmit={submit} noValidate className="space-y-4">
        <fieldset>
          <legend className="label">Proposed times</legend>
          <div className="space-y-2">
            {times.map((t, i) => (
              <div key={i} className="flex gap-2">
                <label htmlFor={`t-${i}`} className="sr-only">Time option {i + 1}</label>
                <input id={`t-${i}`} type="datetime-local" min={minDt} className="input" value={t} onChange={(e) => setTimes(times.map((x, j) => (j === i ? e.target.value : x)))} />
                {times.length > 1 && <button type="button" className="rounded-xl p-2.5 text-navy-400 hover:bg-coral-50" onClick={() => setTimes(times.filter((_, j) => j !== i))} aria-label={`Remove time ${i + 1}`}><X className="h-4 w-4" /></button>}
              </div>
            ))}
            {times.length < 3 && <button type="button" className="btn-ghost btn-sm" onClick={() => setTimes([...times, ""])}>+ Add another time</button>}
          </div>
        </fieldset>
        <Field label="Format" required>
          <select className="input" value={format} onChange={(e) => setFormat(e.target.value as InterviewFormat)}>
            <option value="video">Video call</option><option value="phone">Phone call</option><option value="in_person_public">In person — public place</option>
          </select>
        </Field>
        <Field label={format === "in_person_public" ? "Public place" : "Details"} optional={format !== "in_person_public"} required={format === "in_person_public"} hint={format === "in_person_public" ? "e.g. “Albany Library, front lobby” — never a private home." : "e.g. “I'll send a video link by email.”"}>
          <input className="input" value={location} onChange={(e) => setLocation(e.target.value)} maxLength={200} />
        </Field>
        <Field label="Message"><textarea className="input min-h-[90px]" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={1000} /></Field>
        <label className="flex items-center gap-2.5 text-sm"><input type="checkbox" className="h-4 w-4 accent-bay-500" checked={guardian} onChange={(e) => setGuardian(e.target.checked)} /> Let them know a parent or guardian is welcome</label>
        {err && <Alert tone="error">{err}</Alert>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-outline" onClick={onClose}>Cancel</button>
          <button type="submit" disabled={busy} className="btn-primary">{busy ? "Sending…" : "Send request"}</button>
        </div>
      </form>
    </Modal>
  );
}
