"use client";
import Link from "next/link";
import { useState } from "react";
import { Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { useData } from "@/lib/auth-context";
import { errorMessage } from "@/lib/utils";
import { StarInput, YesNo } from "./ratings";

const looksLikeContactInfo = (s: string) => /\b\d{3}[-.\s)]*\d{3}[-.\s]*\d{4}\b|@\S+\.\S+|\b\d{1,5}\s+\w+\s+(st|street|ave|avenue|rd|road|blvd|way|dr|drive|ct|court|ln|lane)\b/i.test(s);

/** Teen → public employer rating (aggregates only) + private note for moderators. */
export function RateEmployerForm({ applicationId, employerName, jobId, onDone }: { applicationId: string; employerName: string; jobId: string; onDone: () => void }) {
  const data = useData();
  const toast = useToast();
  const [stars, setStars] = useState(0);
  const [paid, setPaid] = useState<boolean | null>(null);
  const [matched, setMatched] = useState<boolean | null>(null);
  const [safe, setSafe] = useState<boolean | null>(null);
  const [respectful, setRespectful] = useState<boolean | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stars) return setError("Choose 1 to 5 stars.");
    if ([paid, matched, safe, respectful].some((v) => v === null)) return setError("Answer all four questions.");
    if (looksLikeContactInfo(note)) return setError("Please don't include phone numbers, emails or addresses in your note.");
    setError("");
    setBusy(true);
    try {
      await data.submitEmployerReview(applicationId, { stars, paid_as_promised: !!paid, matched_listing: !!matched, felt_safe: !!safe, respectful: !!respectful, private_note: note });
      toast({ tone: "success", title: "Thanks for rating", body: `Your rating helps other teens decide whether to work with ${employerName}.` });
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const unsafeOrUnpaid = safe === false || paid === false;

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <div>
        <p className="label">Overall, how was working for {employerName}?</p>
        <StarInput value={stars} onChange={(v) => { setStars(v); setError(""); }} />
      </div>
      <div className="space-y-2">
        <YesNo name="paid" label="Paid as promised" value={paid} onChange={setPaid} />
        <YesNo name="matched" label="Job matched the listing" value={matched} onChange={setMatched} />
        <YesNo name="safe" label="I felt safe" value={safe} onChange={setSafe} />
        <YesNo name="respectful" label="Respectful communication" value={respectful} onChange={setRespectful} />
      </div>
      {unsafeOrUnpaid && (
        <Alert tone="warn" title="Please also file a private report">
          Ratings don&apos;t alert a moderator on their own.{" "}
          {paid === false && <><Link href={`/report/payment?job=${jobId}`} className="link">Report a payment problem</Link>{safe === false ? " · " : ""}</>}
          {safe === false && <Link href="/report" className="link">Report a safety concern</Link>}
          {" — "}if you&apos;re in danger, call 911.
        </Alert>
      )}
      <Field label="Anything TaskTeens should know?" optional hint="Private — only TaskTeens moderators see this. It's never shown publicly or to the employer.">
        <textarea className="input min-h-[80px]" maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <p className="text-xs leading-5 text-navy-500">
        Publicly, TaskTeens only shows combined results (like &ldquo;98% paid as promised&rdquo;). The employer sees your stars and answers but not your name or note — though if only a few teens worked this job, they might guess. Retaliation is against our rules; report it if it happens.
      </p>
      {error && <Alert tone="error">{error}</Alert>}
      <button type="submit" disabled={busy} className="btn-coral w-full">{busy ? "Submitting…" : "Submit rating"}</button>
    </form>
  );
}

/** Employer → private structured feedback about a teen. Never public, never shown to the teen. */
export function TeenFeedbackForm({ applicationId, onDone }: { applicationId: string; onDone: () => void }) {
  const data = useData();
  const toast = useToast();
  const [showed, setShowed] = useState<boolean | null>(null);
  const [comm, setComm] = useState<boolean | null>(null);
  const [done, setDone] = useState<boolean | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if ([showed, comm, done].some((v) => v === null)) return setError("Answer all three questions.");
    setError("");
    setBusy(true);
    try {
      await data.submitTeenFeedback(applicationId, { showed_up: !!showed, communicated: !!comm, completed_job: !!done, note });
      toast({ tone: "success", title: "Feedback sent to TaskTeens", body: "Thanks — this stays private." });
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-3">
      <p className="text-sm text-navy-600">Private feedback to TaskTeens. Teens are never publicly rated, and the teen does not see this.</p>
      <YesNo name="showed" label="Showed up as agreed" value={showed} onChange={setShowed} />
      <YesNo name="comm" label="Communicated well" value={comm} onChange={setComm} />
      <YesNo name="done" label="Completed the job" value={done} onChange={setDone} />
      <Field label="Note for TaskTeens" optional hint="Private. Keep it factual and about this job.">
        <textarea className="input min-h-[70px]" maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      {error && <Alert tone="error">{error}</Alert>}
      <button type="submit" disabled={busy} className="btn-primary w-full">{busy ? "Sending…" : "Send private feedback"}</button>
    </form>
  );
}
