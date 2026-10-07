"use client";
import { ArrowLeft, FileText, Paperclip, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { NoteActionModal, type PendingAction } from "@/components/dashboard/note-action";
import { RequiresBackend } from "@/components/safety/demo-notice";
import { Badge } from "@/components/ui/badge";
import { Alert, ErrorState, Skeleton } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/lib/auth-context";
import { isDemoMode } from "@/lib/config";
import { kickNotifications } from "@/lib/safety/kick";
import { CLOSED, EVIDENCE_ACCEPT, FLAG_LABEL, STATUS_LABEL, categoryLabel, uploadEvidence } from "@/lib/safety/incidents";
import { must, safetySupabase, useSafetyQuery } from "@/lib/safety/client";
import { formatDateTime } from "@/lib/utils";

interface Incident {
  id: string; application_id: string | null; job_id: string | null; teen_id: string | null; employer_id: string | null; reporter_id: string | null; reporter_role: string;
  category: string; occurred_at: string | null; location_text: string | null; people_involved: string | null; anyone_in_danger: boolean; anyone_injured: boolean;
  actions_taken: string | null; statement: string; pet_details: Record<string, string> | null; status: string; response_open: boolean;
  related_alert_id: string | null; created_at: string; admin_outcome_note: string | null; closed_at: string | null;
}
interface Statement { id: string; author_id: string | null; author_role: string; body: string; admin_only: boolean; created_at: string }
interface Evidence { id: string; uploader_id: string | null; uploader_role: string; phase: string; storage_path: string; mime_type: string; size_bytes: number; integrity_flags: string[]; caption: string | null; original_metadata: Record<string, string>; created_at: string; url?: string }

const ADMIN_STATUSES = ["urgent", "awaiting_response", "referred", "substantiated", "unsubstantiated", "inconclusive", "resolved"] as const;

function Detail() {
  const { id } = useParams<{ id: string }>();
  const sp = useSearchParams();
  const { session } = useAuth();
  const toast = useToast();
  const isAdmin = session?.user.role === "admin";
  const [body, setBody] = useState("");
  const [adminOnly, setAdminOnly] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [action, setAction] = useState<PendingAction | null>(null);
  const [nextStatus, setNextStatus] = useState<(typeof ADMIN_STATUSES)[number]>("resolved");
  const [unfreeze, setUnfreeze] = useState(true);

  const q = useSafetyQuery(async (sb) => {
    const inc = must(await sb.from("incident_reports").select("*").eq("id", id).maybeSingle()) as Incident | null;
    if (!inc) return null;
    const statements = must(await sb.from("incident_responses").select("*").eq("incident_id", id).order("created_at")) as Statement[];
    let evidence = must(await sb.from("incident_evidence").select("*").or(`incident_id.eq.${id}${inc.application_id ? `,application_id.eq.${inc.application_id}` : ""}`).order("created_at")) as Evidence[];
    if (evidence.length) {
      const { data: urls } = await sb.storage.from("incident-evidence").createSignedUrls(evidence.map((e) => e.storage_path), 600);
      evidence = evidence.map((e) => ({ ...e, url: urls?.find((u) => u.path === e.storage_path)?.signedUrl ?? undefined }));
    }
    const job = inc.job_id ? ((await sb.from("jobs").select("title").eq("id", inc.job_id).maybeSingle()).data as { title: string } | null) : null;
    return { inc, statements, evidence, jobTitle: job?.title ?? null };
  }, [id]);

  if (isDemoMode) return <RequiresBackend feature="Incident reports" />;
  if (q.loading && !q.data) return <Skeleton className="h-64" />;
  if (q.error) return <ErrorState message={q.error} onRetry={q.reload} />;
  if (!q.data) return <Alert tone="warn" title="Report not found">It doesn&apos;t exist, or you don&apos;t have access to it.</Alert>;
  const { inc, statements, evidence, jobTitle } = q.data;
  const sb = safetySupabase()!;
  const closed = CLOSED.has(inc.status);

  const addStatement = async () => {
    if (!body.trim()) return;
    setBusy("Saving…");
    const { error } = await sb.rpc("add_incident_statement", { p_incident: id, p_body: body, p_admin_only: isAdmin && adminOnly });
    setBusy(null);
    if (error) return toast({ tone: "error", title: "Couldn't save", body: error.message });
    setBody(""); kickNotifications(); toast({ tone: "success", title: "Statement added" }); q.reload();
  };
  const addFiles = async (files: File[]) => {
    const failed: string[] = [];
    for (const [i, f] of files.entries()) {
      setBusy(`Uploading ${i + 1} of ${files.length}…`);
      try { await uploadEvidence(sb, session!.user.id, f, { phase: "incident", incidentId: id }); } catch (x) { failed.push(x instanceof Error ? x.message : f.name); }
    }
    setBusy(null);
    if (failed.length) toast({ tone: "error", title: "Some files didn't upload", body: failed.join("\n") }); else toast({ tone: "success", title: "Files added" });
    q.reload();
  };

  return (
    <div className="space-y-6">
      {sp.get("filed") && <Alert tone="success" title="Report sent">TaskTeens administrators were notified. You can add statements and files below.</Alert>}
      {sp.get("upload_failed") && <Alert tone="error" title="Report sent, but some files didn't upload">{sp.get("upload_failed")} — try adding them again below.</Alert>}

      <section className="card p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={closed ? "gray" : inc.status === "urgent" ? "coral" : "amber"}>{STATUS_LABEL[inc.status] ?? inc.status}</Badge>
          {inc.anyone_in_danger && <Badge tone="coral">Someone in danger</Badge>}
          {inc.anyone_injured && <Badge tone="coral">Injury</Badge>}
          <span className="text-xs text-navy-400">Filed {formatDateTime(inc.created_at)} by the {inc.reporter_role}{inc.reporter_id === session?.user.id ? " (you)" : ""}</span>
        </div>
        <h1 className="mt-3 text-2xl font-bold">{categoryLabel(inc.category)}</h1>
        {jobTitle && <p className="text-sm text-navy-500">Job: “{jobTitle}”</p>}
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          {inc.occurred_at && <div><dt className="text-xs font-semibold text-navy-400">When</dt><dd>{formatDateTime(inc.occurred_at)}</dd></div>}
          {inc.location_text && <div><dt className="text-xs font-semibold text-navy-400">Where</dt><dd>{inc.location_text}</dd></div>}
          {inc.people_involved && <div><dt className="text-xs font-semibold text-navy-400">Who was involved</dt><dd>{inc.people_involved}</dd></div>}
          {inc.pet_details && <div><dt className="text-xs font-semibold text-navy-400">Pet</dt><dd>{Object.values(inc.pet_details).filter(Boolean).join(" · ")}</dd></div>}
        </dl>
        <h2 className="mt-4 text-xs font-semibold uppercase tracking-wide text-navy-400">Report</h2>
        <p className="mt-1 whitespace-pre-wrap text-sm">{inc.statement}</p>
        {inc.actions_taken && <><h2 className="mt-4 text-xs font-semibold uppercase tracking-wide text-navy-400">Actions taken</h2><p className="mt-1 whitespace-pre-wrap text-sm">{inc.actions_taken}</p></>}
        {inc.admin_outcome_note && <Alert tone={closed ? "info" : "warn"} className="mt-4" title={closed ? "Outcome" : "Note from TaskTeens"}>{inc.admin_outcome_note}</Alert>}
      </section>

      {isAdmin && (
        <section className="card space-y-3 border-2 border-navy-200 p-5">
          <h2 className="flex items-center gap-2 font-bold"><ShieldAlert className="h-5 w-5" aria-hidden="true" /> Admin review</h2>
          <p className="text-xs text-navy-500">{inc.response_open ? "The other side can read this report and respond." : "The other side can't see this report yet."}</p>
          <div className="flex flex-wrap gap-2">
            {!inc.response_open && <button className="btn-outline btn-sm" onClick={() => setAction({ title: "Ask the other side for their response?", description: "They'll be able to read this report, its statements and files, and add their own. Reporter contact details aren't shown.", confirmLabel: "Open for response", requireNote: true, run: async (n) => { must(await sb.rpc("admin_open_incident_response", { p_incident: id, p_note: n })); } })}>Ask the other side to respond</button>}
            {inc.employer_id && <button className="btn-danger btn-sm" onClick={() => setAction({ title: "Temporarily restrict the employer?", description: "Their listings are hidden and they can't publish, message or change applications until you lift it on the Safety alerts page.", confirmLabel: "Restrict", danger: true, requireNote: true, run: async (n) => { must(await sb.rpc("admin_restrict_user", { p_user: inc.employer_id, p_reason: n, p_alert: null, p_incident: id })); } })}>Restrict employer</button>}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <select className="input w-auto" value={nextStatus} onChange={(e) => setNextStatus(e.target.value as (typeof ADMIN_STATUSES)[number])}>
              {ADMIN_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
            {CLOSED.has(nextStatus) && inc.application_id && <label className="flex items-center gap-1.5"><input type="checkbox" checked={unfreeze} onChange={(e) => setUnfreeze(e.target.checked)} /> Unfreeze the job if nothing else is open</label>}
            <button className="btn-navy btn-sm" onClick={() => setAction({ title: `Set status: ${STATUS_LABEL[nextStatus]}?`, description: "Your note is shown to everyone who can see the report as the outcome. Use an admin-only statement for internal notes.", confirmLabel: "Save", requireNote: true, run: async (n) => { must(await sb.rpc("admin_set_incident_status", { p_incident: id, p_status: nextStatus, p_note: n, p_unfreeze_job: CLOSED.has(nextStatus) && unfreeze })); } })}>Update status</button>
          </div>
        </section>
      )}

      <section className="card p-5">
        <h2 className="font-bold">Statements</h2>
        {!statements.length ? <p className="mt-2 text-sm text-navy-500">No statements yet.</p> : (
          <ol className="mt-3 space-y-3">
            {statements.map((s) => (
              <li key={s.id} className={s.admin_only ? "rounded-xl border border-dashed border-navy-300 p-3" : "rounded-xl bg-cream-50 p-3"}>
                <p className="text-xs font-semibold text-navy-400">{s.author_role === "admin" ? "TaskTeens" : s.author_role}{s.author_id === session?.user.id ? " (you)" : ""} · {formatDateTime(s.created_at)}{s.admin_only ? " · admin-only" : ""}</p>
                <p className="mt-1 whitespace-pre-wrap text-sm">{s.body}</p>
              </li>
            ))}
          </ol>
        )}
        {!closed || isAdmin ? (
          <div className="mt-4 space-y-2">
            <label htmlFor="stmt" className="text-sm font-semibold">Add a statement</label>
            <textarea id="stmt" className="input min-h-[90px]" value={body} onChange={(e) => setBody(e.target.value)} maxLength={6000} />
            {isAdmin && <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={adminOnly} onChange={(e) => setAdminOnly(e.target.checked)} /> Admin-only note (participants won&apos;t see it)</label>}
            <p className="text-xs text-navy-400">Statements can&apos;t be edited or deleted after you add them.</p>
            <button className="btn-primary btn-sm" disabled={!!busy || !body.trim()} onClick={addStatement}>{busy ?? "Add statement"}</button>
          </div>
        ) : <p className="mt-3 text-xs text-navy-500">This report is closed.</p>}
      </section>

      <section className="card p-5">
        <h2 className="font-bold">Files</h2>
        <p className="text-xs text-navy-500">File dates come from the uploader&apos;s device and may be missing or wrong. Flags are things for reviewers to check, not proof.</p>
        {!evidence.length ? <p className="mt-2 text-sm text-navy-500">No files yet.</p> : (
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {evidence.map((e) => (
              <li key={e.id} className="rounded-xl border border-navy-100 p-2 text-xs">
                {e.url && e.mime_type.startsWith("image/") && !e.mime_type.includes("hei") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <a href={e.url} target="_blank" rel="noopener noreferrer"><img src={e.url} alt={e.caption ?? "Evidence photo"} className="h-40 w-full rounded-lg object-cover" /></a>
                ) : e.url && e.mime_type.startsWith("video/") ? (
                  <video src={e.url} controls className="h-40 w-full rounded-lg bg-black" />
                ) : (
                  <a href={e.url} target="_blank" rel="noopener noreferrer" className="flex h-20 items-center justify-center gap-2 rounded-lg bg-cream-50"><FileText className="h-5 w-5" aria-hidden="true" /> Open file</a>
                )}
                <p className="mt-1">{e.phase === "incident" ? "Report file" : `${e.phase === "before" ? "Before" : "After"} photo`} · {e.uploader_role}{e.uploader_id === session?.user.id ? " (you)" : ""} · uploaded {formatDateTime(e.created_at)}</p>
                {e.original_metadata?.last_modified && <p className="text-navy-400">Device file date: {formatDateTime(e.original_metadata.last_modified)}</p>}
                {e.caption && <p>{e.caption}</p>}
                {!!e.integrity_flags.length && <p className="mt-1 text-amber-700">⚑ {e.integrity_flags.map((f) => FLAG_LABEL[f] ?? f).join(" · ")}</p>}
              </li>
            ))}
          </ul>
        )}
        {(!closed || isAdmin) && (
          <label className="btn-outline btn-sm mt-4 cursor-pointer"><Paperclip className="h-4 w-4" aria-hidden="true" /> {busy ?? "Add files"}
            <input type="file" multiple accept={EVIDENCE_ACCEPT} className="sr-only" disabled={!!busy} onChange={(e) => { const f = Array.from(e.target.files ?? []); e.target.value = ""; if (f.length) void addFiles(f); }} />
          </label>
        )}
      </section>
      <NoteActionModal action={action} onClose={() => setAction(null)} onDone={() => { setAction(null); toast({ tone: "success", title: "Saved" }); kickNotifications(); q.reload(); }} />
    </div>
  );
}

export default function IncidentPage() {
  const { session } = useAuth();
  return (
    <div className="container-page max-w-3xl py-10">
      <Link href={session?.user.role === "admin" ? "/admin/incidents" : "/incidents"} className="link mb-4 inline-flex items-center gap-1 text-sm"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> All reports</Link>
      <Suspense><Detail /></Suspense>
    </div>
  );
}
