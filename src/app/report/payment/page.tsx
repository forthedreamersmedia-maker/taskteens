"use client";
import { CheckCircle2, Scale, Wallet } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { useAuth } from "@/lib/auth-context";
import { useAsync } from "@/lib/hooks/use-async";
import { errorMessage, formatPay } from "@/lib/utils";

type Form = {
  applicationId: string;
  opportunity: string;
  employer: string;
  agreed: string;
  dates: string;
  hours: string;
  received: string;
  unpaid: string;
  communications: string;
  evidence: string;
  guardian: "yes" | "no" | "";
  email: string;
  confirm: boolean;
};

const money = (v: string) => /^\$?\s*\d+(\.\d{1,2})?$/.test(v.trim());

function PaymentReport() {
  const { data, session } = useAuth();
  const sp = useSearchParams();
  const isTeen = session?.user.role === "teen";
  const { data: apps = [] } = useAsync(async () => (isTeen ? data.listMyApplications() : []), [isTeen]);
  const [f, setF] = useState<Form>({ applicationId: "", opportunity: "", employer: "", agreed: "", dates: "", hours: "", received: "", unpaid: "", communications: "", evidence: "", guardian: "", email: "", confirm: false });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  // Pre-select the job when linked from the dashboard (?job=...)
  useEffect(() => {
    const job = sp.get("job");
    const match = job ? apps.find((a) => a.job_id === job) : undefined;
    if (match) setF((x) => ({ ...x, applicationId: match.id }));
  }, [apps, sp]);

  const selectedApp = useMemo(() => apps.find((a) => a.id === f.applicationId), [apps, f.applicationId]);
  useEffect(() => {
    if (selectedApp) setF((x) => ({ ...x, opportunity: selectedApp.job.title, employer: selectedApp.employer_name, agreed: x.agreed || formatPay(selectedApp.job) }));
  }, [selectedApp]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setF((x) => ({ ...x, [k]: v }));
    setErrors((e) => ({ ...e, [k]: "" }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const err: Record<string, string> = {};
    if (f.opportunity.trim().length < 3) err.opportunity = "Tell us which job this was.";
    if (f.employer.trim().length < 2) err.employer = "Enter the employer or person who hired you.";
    if (f.agreed.trim().length < 2) err.agreed = "What pay was agreed? e.g. $20/hr or $120 flat.";
    if (f.dates.trim().length < 3) err.dates = "Enter the date(s) you worked.";
    if (f.received.trim() && !money(f.received)) err.received = "Enter a dollar amount, e.g. 40 or $40.00 (0 if nothing).";
    if (!money(f.unpaid)) err.unpaid = "Enter the amount you believe is still owed, e.g. 80.";
    if (!f.guardian) err.guardian = "Let us know whether a parent or guardian knows about this.";
    if (!session && !/^\S+@\S+\.\S+$/.test(f.email)) err.email = "Enter an email so we can follow up with you.";
    if (!f.confirm) err.confirm = "Please confirm the information is accurate to the best of your knowledge.";
    setErrors(err);
    if (Object.values(err).some(Boolean)) return;

    const details = [
      `PAYMENT REPORT`,
      `Opportunity: ${f.opportunity}`,
      `Employer / Job Poster: ${f.employer}`,
      `Agreed compensation: ${f.agreed}`,
      `Dates worked: ${f.dates}`,
      `Approximate hours: ${f.hours || "not provided"}`,
      `Amount received: ${f.received || "0"}`,
      `Amount believed unpaid: ${f.unpaid}`,
      `Parent/guardian aware: ${f.guardian}`,
      f.communications && `Relevant communications: ${f.communications}`,
      f.evidence && `Evidence of payment / completed work: ${f.evidence}`,
    ]
      .filter(Boolean)
      .join("\n")
      .slice(0, 3990);

    setBusy(true);
    try {
      await data.createReport({
        target_type: selectedApp ? "job" : "other",
        target_id: selectedApp?.job_id ?? null,
        reason: "Pay not received / pay dispute",
        details,
        severity: "normal",
        contact_email: session ? session.user.email : f.email,
      });
      setDone(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e2) {
      setErrors({ _form: errorMessage(e2) });
    } finally {
      setBusy(false);
    }
  };

  if (done)
    return (
      <div className="container-page max-w-2xl py-16">
        <div className="card p-8 text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" aria-hidden="true" />
          <h1 className="mt-3 text-2xl font-bold">Payment report received</h1>
          <p className="mt-2 text-navy-600">A TaskTeens moderator will review it and may contact you or the employer for more information. Keep any texts, emails or receipts related to this job.</p>
          <p className="mt-3 text-sm text-navy-500">Filing a report with TaskTeens doesn&apos;t stop you from filing a wage claim with the California Labor Commissioner or getting other legal help.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link href="/payment-policy" className="btn-outline">Read the payment policy</Link>
            <Link href={isTeen ? "/dashboard/teen/applications" : "/"} className="btn-primary">{isTeen ? "Back to my applications" : "Back to home"}</Link>
          </div>
        </div>
      </div>
    );

  return (
    <div className="container-page max-w-2xl py-12">
      <p className="eyebrow flex items-center gap-1.5"><Wallet className="h-4 w-4" aria-hidden="true" /> Payment report</p>
      <h1 className="mt-2 text-3xl font-bold">Report a payment problem</h1>
      <p className="mt-2 text-navy-600">
        Didn&apos;t get paid, or got paid less than agreed? Tell us what happened. Reports go to TaskTeens moderators, who review them under the{" "}
        <Link href="/payment-policy" className="link">Payment and Nonpayment Policy</Link>.
      </p>

      <Alert tone="info" className="mt-6" title="Involve a trusted adult">
        We recommend telling a parent or guardian about a payment dispute. If you ever feel unsafe, stop contact and call 911 in an emergency.
      </Alert>

      <form onSubmit={submit} noValidate className="card mt-6 space-y-5 p-5 sm:p-6">
        {isTeen && apps.length > 0 && (
          <Field label="Which job was it?" hint="Pick from your TaskTeens applications, or fill in the details below.">
            <select className="input" value={f.applicationId} onChange={(e) => set("applicationId", e.target.value)}>
              <option value="">Other / not listed</option>
              {apps.map((a) => (
                <option key={a.id} value={a.id}>{a.job.title} — {a.employer_name}</option>
              ))}
            </select>
          </Field>
        )}
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Job / opportunity" required error={errors.opportunity}>
            <input className="input" value={f.opportunity} onChange={(e) => set("opportunity", e.target.value)} placeholder="e.g. Weekend dog walking" />
          </Field>
          <Field label="Employer or person who hired you" required error={errors.employer}>
            <input className="input" value={f.employer} onChange={(e) => set("employer", e.target.value)} />
          </Field>
          <Field label="Agreed pay" required error={errors.agreed} hint="e.g. $20/hr or $120 flat">
            <input className="input" value={f.agreed} onChange={(e) => set("agreed", e.target.value)} />
          </Field>
          <Field label="Date(s) worked" required error={errors.dates}>
            <input className="input" value={f.dates} onChange={(e) => set("dates", e.target.value)} placeholder="e.g. Sept 13 and Sept 20" />
          </Field>
          <Field label="Approximate hours worked" optional>
            <input className="input" inputMode="decimal" value={f.hours} onChange={(e) => set("hours", e.target.value)} placeholder="e.g. 6" />
          </Field>
          <Field label="Amount you received ($)" optional error={errors.received} hint="Enter 0 if you weren't paid anything.">
            <input className="input" inputMode="decimal" value={f.received} onChange={(e) => set("received", e.target.value)} />
          </Field>
          <Field label="Amount you believe is still owed ($)" required error={errors.unpaid} className="sm:col-span-2">
            <input className="input" inputMode="decimal" value={f.unpaid} onChange={(e) => set("unpaid", e.target.value)} />
          </Field>
        </div>
        <Field label="What was said about payment?" optional hint="Summarize any texts, emails or conversations — what was promised and when.">
          <textarea className="input min-h-[90px]" maxLength={1200} value={f.communications} onChange={(e) => set("communications", e.target.value)} />
        </Field>
        <Field label="Evidence you have" optional hint="e.g. screenshots of messages, a Venmo/Zelle request, photos of completed work. Describe it here — a moderator will ask for copies if needed. Don't include bank or card numbers.">
          <textarea className="input min-h-[80px]" maxLength={1000} value={f.evidence} onChange={(e) => set("evidence", e.target.value)} />
        </Field>
        <fieldset>
          <legend className="label">Does a parent or guardian know about this? <span className="text-coral-600" aria-hidden="true">*</span></legend>
          <div className="flex gap-3">
            {(["yes", "no"] as const).map((v) => (
              <label key={v} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-2 text-sm capitalize ${f.guardian === v ? "border-bay-400 bg-bay-50" : "border-navy-200"}`}>
                <input type="radio" name="guardian" checked={f.guardian === v} onChange={() => set("guardian", v)} className="accent-bay-500" /> {v}
              </label>
            ))}
          </div>
          {errors.guardian && <p className="field-error">{errors.guardian}</p>}
        </fieldset>
        {!session && (
          <Field label="Your email" required error={errors.email} hint="So a moderator can follow up.">
            <input type="email" className="input" value={f.email} onChange={(e) => set("email", e.target.value)} autoComplete="email" />
          </Field>
        )}
        <div>
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-bay-500" checked={f.confirm} onChange={(e) => set("confirm", e.target.checked)} />
            <span>The information in this report is accurate to the best of my knowledge.</span>
          </label>
          {errors.confirm && <p className="field-error">{errors.confirm}</p>}
        </div>
        {errors._form && <Alert tone="error">{errors._form}</Alert>}
        <button type="submit" disabled={busy} className="btn-coral w-full">{busy ? "Sending…" : "Submit payment report"}</button>
      </form>

      <div className="mt-6 flex gap-3 rounded-2xl border border-navy-100 bg-white p-4 text-sm text-navy-600">
        <Scale className="h-5 w-5 shrink-0 text-navy-400" aria-hidden="true" />
        <p>TaskTeens enforces its own rules but can&apos;t decide legal wage claims. You always have the right to file a wage claim with the California Labor Commissioner&apos;s Office or seek legal help, whether or not you report here.</p>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense>
      <PaymentReport />
    </Suspense>
  );
}
