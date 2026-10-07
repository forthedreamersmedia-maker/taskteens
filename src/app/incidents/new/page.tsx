"use client";
import { AlertOctagon, Paperclip, Phone } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { RequiresBackend } from "@/components/safety/demo-notice";
import { Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { useAuth } from "@/lib/auth-context";
import { isDemoMode } from "@/lib/config";
import { kickNotifications } from "@/lib/safety/kick";
import { EVIDENCE_ACCEPT, INCIDENT_CATEGORIES, uploadEvidence, type IncidentCategory } from "@/lib/safety/incidents";
import { safetySupabase, useSafetyQuery } from "@/lib/safety/client";

interface AppRow { id: string; status: string; applicant_name: string; job: { title: string } | null }

function NewIncident() {
  const { session } = useAuth();
  const router = useRouter();
  const sp = useSearchParams();
  const [application, setApplication] = useState<string>(sp.get("application") ?? "");
  const [category, setCategory] = useState<IncidentCategory | "">("");
  const [occurredAt, setOccurredAt] = useState("");
  const [where, setWhere] = useState("");
  const [people, setPeople] = useState("");
  const [danger, setDanger] = useState(false);
  const [injured, setInjured] = useState(false);
  const [actions, setActions] = useState("");
  const [statement, setStatement] = useState("");
  const [pet, setPet] = useState({ name: "", kind: "", description: "", last_seen: "" });
  const [files, setFiles] = useState<File[]>([]);
  const [accurate, setAccurate] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const apps = useSafetyQuery(async (sb) => ((await sb.from("applications").select("id,status,applicant_name,job:jobs(title)")
    .in("status", ["selected", "confirmed", "cancelled", "parent_declined", "interview_requested", "viewed", "submitted"]).order("created_at", { ascending: false }).limit(50)).data ?? []) as unknown as AppRow[], [session?.user.id]);

  if (isDemoMode) return <RequiresBackend feature="Incident reports" />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!category) return setError("Choose what happened.");
    if (statement.trim().length < 10) return setError("Describe what happened (at least a sentence).");
    if (category === "lost_pet" && !pet.description.trim() && !pet.name.trim()) return setError("Describe the pet.");
    if (!accurate) return setError("Please confirm the report is accurate to the best of your knowledge.");
    const sb = safetySupabase()!;
    setBusy("Sending report…");
    const { data, error: err } = await sb.rpc("file_incident_report", {
      p_application: application || null, p_category: category, p_statement: statement,
      p_occurred_at: occurredAt ? new Date(occurredAt).toISOString() : null, p_location_text: where || null, p_people_involved: people || null,
      p_anyone_in_danger: danger, p_anyone_injured: injured, p_actions_taken: actions || null,
      p_pet_details: category === "lost_pet" ? pet : null, p_accuracy_confirmed: accurate, p_related_alert: sp.get("alert") || null,
    });
    if (err) { setBusy(null); return setError(err.message); }
    const id = data as string;
    const failed: string[] = [];
    for (const [i, f] of files.entries()) {
      setBusy(`Uploading file ${i + 1} of ${files.length}…`);
      try { await uploadEvidence(sb, session!.user.id, f, { phase: "incident", incidentId: id }); } catch (x) { failed.push(x instanceof Error ? x.message : f.name); }
    }
    kickNotifications();
    router.push(`/incidents/${id}${failed.length ? `?upload_failed=${encodeURIComponent(failed.join(" | "))}` : "?filed=1"}`);
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <Field label="Which job is this about?" hint="Choose a job so the right people can review it.">
        <select className="input" value={application} onChange={(e) => setApplication(e.target.value)}>
          <option value="">Not about a specific job</option>
          {apps.data?.map((a) => <option key={a.id} value={a.id}>{a.job?.title ?? "Job"}{session?.user.role !== "teen" ? ` — ${a.applicant_name}` : ""}</option>)}
        </select>
      </Field>
      <fieldset>
        <legend className="label">What happened?</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {INCIDENT_CATEGORIES.map((c) => (
            <label key={c.id} className={`flex cursor-pointer gap-2 rounded-xl border p-3 text-sm ${category === c.id ? "border-navy-700 bg-navy-50" : "border-navy-100"}`}>
              <input type="radio" name="category" value={c.id} checked={category === c.id} onChange={() => setCategory(c.id)} />
              <span><span className="font-semibold">{c.label}</span>{c.hint && <span className="block text-xs text-navy-500">{c.hint}</span>}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {(category === "safety_emergency" || category === "missing_person" || danger) && (
        <Alert tone="error" title="If someone is in danger right now, call 911 first.">
          <a href="tel:911" className="btn btn-sm mt-2 bg-coral-600 text-white hover:bg-coral-700"><Phone className="h-4 w-4" aria-hidden="true" /> Call 911</a>
          <span className="mt-1 block">This report goes to TaskTeens, not to emergency services.</span>
        </Alert>
      )}
      {category === "lost_pet" && (
        <div className="grid gap-3 rounded-2xl bg-cream-50 p-4 sm:grid-cols-2">
          <Field label="Pet's name"><input className="input" value={pet.name} onChange={(e) => setPet({ ...pet, name: e.target.value })} maxLength={80} /></Field>
          <Field label="Kind of animal"><input className="input" value={pet.kind} onChange={(e) => setPet({ ...pet, kind: e.target.value })} maxLength={80} /></Field>
          <Field label="Color, size, collar"><input className="input" value={pet.description} onChange={(e) => setPet({ ...pet, description: e.target.value })} maxLength={300} /></Field>
          <Field label="Where and when last seen"><input className="input" value={pet.last_seen} onChange={(e) => setPet({ ...pet, last_seen: e.target.value })} maxLength={300} /></Field>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="When did it happen?" optional><input type="datetime-local" className="input" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} /></Field>
        <Field label="Where?" optional hint="General area is fine."><input className="input" value={where} onChange={(e) => setWhere(e.target.value)} maxLength={300} /></Field>
      </div>
      <Field label="Who was involved?" optional><input className="input" value={people} onChange={(e) => setPeople(e.target.value)} maxLength={1000} /></Field>
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" checked={danger} onChange={(e) => setDanger(e.target.checked)} /> Someone was in danger</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={injured} onChange={(e) => setInjured(e.target.checked)} /> Someone was hurt</label>
      </div>
      <Field label="Describe what happened" required hint="What was said or done, in order. Stick to what you saw or heard.">
        <textarea className="input min-h-[140px]" value={statement} onChange={(e) => setStatement(e.target.value)} maxLength={6000} />
      </Field>
      <Field label="What have you done so far?" optional hint="For example: left the job, called a parent, contacted police.">
        <textarea className="input min-h-[70px]" value={actions} onChange={(e) => setActions(e.target.value)} maxLength={2000} />
      </Field>
      <Field label="Photos, videos or documents" optional hint="Screenshots, photos of damage, receipts. Up to 25 MB each. Once uploaded, files can't be changed or removed.">
        <div>
        <label className="btn-outline btn-sm cursor-pointer"><Paperclip className="h-4 w-4" aria-hidden="true" /> Add files
          <input type="file" multiple accept={EVIDENCE_ACCEPT} className="sr-only" onChange={(e) => setFiles([...files, ...Array.from(e.target.files ?? [])])} />
        </label>
        {!!files.length && <ul className="mt-2 space-y-1 text-xs">{files.map((f, i) => <li key={i} className="flex justify-between gap-2"><span className="truncate">{f.name} ({Math.ceil(f.size / 1024)} KB)</span><button type="button" className="link" onClick={() => setFiles(files.filter((_, j) => j !== i))}>Remove</button></li>)}</ul>}
        </div>
      </Field>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={accurate} onChange={(e) => setAccurate(e.target.checked)} /> This report is accurate to the best of my knowledge.</label>
      <p className="text-xs text-navy-500">Who sees this: TaskTeens administrators{session?.user.role !== "parent" ? ", the teen's parent or guardian" : ""}{session?.user.role === "parent" ? " and your teen" : ""}. The other side of the job sees it only if TaskTeens asks for their response.</p>
      {error && <Alert tone="error">{error}</Alert>}
      <button type="submit" disabled={!!busy} className="btn-primary w-full sm:w-auto">{busy ?? "Submit report"}</button>
    </form>
  );
}

export default function NewIncidentPage() {
  return (
    <div className="container-page max-w-2xl py-10">
      <div className="mb-6 rounded-2xl bg-coral-600 p-4 text-sm text-white">
        <p className="flex items-center gap-2 font-bold"><AlertOctagon className="h-5 w-5" aria-hidden="true" /> In immediate danger? Call 911 first.</p>
      </div>
      <h1 className="text-2xl font-bold sm:text-3xl">File an incident report</h1>
      <p className="mb-6 mt-1 text-sm text-navy-500">TaskTeens reviews every report. Reports can&apos;t be edited after you send them, but you can add statements and files later.</p>
      <div className="card p-5"><Suspense><NewIncident /></Suspense></div>
    </div>
  );
}
