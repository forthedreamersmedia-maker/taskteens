"use client";
import { ArrowLeft, CheckCircle2, FileUp, Mail, PartyPopper, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Field, FieldsetGroup } from "@/components/ui/field";
import { Alert, EmptyState, PageLoader } from "@/components/ui/feedback";
import { TagInput } from "@/components/ui/tag-input";
import { StatusBadge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth-context";
import { useAsync } from "@/lib/hooks/use-async";
import { AGE_RANGES, CITIES, GUARDIAN_CONSENT_LABEL, TRANSPORTATION_LABEL, WORK_PERMIT_LABEL } from "@/lib/constants";
import type { Application, ApplicationInput, GuardianConsentStatus, Transportation, WorkPermitStatus, AgeRange } from "@/lib/types";
import { applicationSchema, fieldErrors } from "@/lib/validation";
import { errorMessage, formatDate } from "@/lib/utils";
import { DataError } from "@/lib/data";

const MAX_RESUME = 5 * 1024 * 1024;
const RESUME_TYPES = ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];

export function ApplyForm({ jobId }: { jobId: string }) {
  const { data, session } = useAuth();
  const { data: bundle, loading } = useAsync(
    async () => {
      const [job, profile, existing, settings] = await Promise.all([data.getJob(jobId), data.getTeenProfile(), data.getMyApplicationForJob(jobId), data.getSettings()]);
      return { job, profile, existing, settings };
    },
    [jobId, session?.user.id],
  );

  const [form, setForm] = useState({
    applicant_name: "",
    age_range: "" as AgeRange | "",
    city: "",
    applicant_email: "",
    applicant_phone: "",
    experience: "",
    skills: [] as string[],
    availability: "",
    transportation: "" as Transportation | "",
    interest_statement: "",
    portfolio_url: "",
    work_permit_status: "" as WorkPermitStatus | "",
    guardian_consent_status: "" as GuardianConsentStatus | "",
    agreed_to_safety_rules: false,
  });
  const [resume, setResume] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<Application | null>(null);
  const submitLock = useRef(false);
  const errorSummaryRef = useRef<HTMLDivElement>(null);

  // Prefill from session + saved profile
  useEffect(() => {
    if (!bundle || !session) return;
    const p = bundle.profile;
    const availability = p?.availability
      ? Object.entries(p.availability)
          .filter(([, v]) => v.length)
          .map(([d, v]) => `${d[0]!.toUpperCase()}${d.slice(1)} ${v.join("/")}`)
          .join(", ")
      : "";
    setForm((f) => ({
      ...f,
      applicant_name: f.applicant_name || session.user.full_name,
      applicant_email: f.applicant_email || session.user.email,
      applicant_phone: f.applicant_phone || session.user.phone || "",
      age_range: f.age_range || p?.age_range || "",
      city: f.city || p?.city || "",
      experience: f.experience || p?.experience || "",
      skills: f.skills.length ? f.skills : p?.skills ?? [],
      availability: f.availability || availability,
      transportation: f.transportation || p?.transportation || "",
      portfolio_url: f.portfolio_url || p?.portfolio_url || "",
      work_permit_status: f.work_permit_status || p?.work_permit_status || "",
      guardian_consent_status: f.guardian_consent_status || p?.guardian_consent_status || "",
    }));
  }, [bundle, session]);

  const minorConsentNeeded = useMemo(() => {
    const age = form.age_range === "14-15" ? 15 : form.age_range === "16-17" ? 17 : form.age_range === "18-19" ? 18 : null;
    return age !== null && bundle ? age < bundle.settings.guardian_consent_under_age : false;
  }, [form.age_range, bundle]);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (errors[k as string]) setErrors((e) => ({ ...e, [k]: "" }));
  };

  if (loading) return <PageLoader label="Loading application…" />;
  const job = bundle?.job;
  if (!job)
    return <div className="container-page py-16"><EmptyState title="This listing isn't accepting applications" action={{ label: "Browse jobs", href: "/jobs" }} /></div>;

  if (submitted) return <Confirmation app={submitted} jobTitle={job.title} employer={job.employer.display_name} />;

  if (bundle?.existing)
    return (
      <div className="container-page max-w-2xl py-16">
        <div className="card p-8 text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" aria-hidden="true" />
          <h1 className="mt-3 text-2xl font-bold">You already applied</h1>
          <p className="mt-2 text-navy-500">You applied to <strong>{job.title}</strong> on {formatDate(bundle.existing.created_at)}.</p>
          <p className="mt-3 flex items-center justify-center gap-2 text-sm">Current status: <StatusBadge status={bundle.existing.status} /></p>
          <Link href="/dashboard/teen/applications" className="btn-primary mt-6">View my applications</Link>
        </div>
      </div>
    );

  const tooYoung = form.age_range === "14-15" ? job.min_age > 15 : form.age_range === "16-17" ? job.min_age > 17 : false;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitLock.current) return; // guards double-clicks / double submits
    const candidate = { job_id: job.id, ...form, portfolio_url: form.portfolio_url || undefined, guardian_consent_status: form.guardian_consent_status || (minorConsentNeeded ? "" : "not_applicable") };
    const parsed = applicationSchema.safeParse(candidate);
    const errs: Record<string, string> = parsed.success ? {} : fieldErrors(parsed.error);
    if (resume) {
      if (resume.size > MAX_RESUME) errs.resume = "Résumé must be under 5 MB.";
      else if (!RESUME_TYPES.includes(resume.type)) errs.resume = "Upload a PDF or Word document.";
    }
    if (Object.keys(errs).length || !parsed.success) {
      setErrors(errs);
      requestAnimationFrame(() => errorSummaryRef.current?.focus());
      return;
    }
    submitLock.current = true;
    setSubmitting(true);
    setErrors({});
    try {
      const app = await data.submitApplication({ ...(parsed.data as Omit<ApplicationInput, "resume_file">), resume_file: resume });
      setSubmitted(app);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      const fields = (err as DataError & { fields?: Record<string, string> }).fields;
      setErrors({ ...(fields ?? {}), _form: errorMessage(err) });
      submitLock.current = false;
      requestAnimationFrame(() => errorSummaryRef.current?.focus());
    } finally {
      setSubmitting(false);
    }
  };

  const errorList = Object.entries(errors).filter(([k, v]) => v && k !== "_form");

  return (
    <div className="container-page max-w-3xl py-8 lg:py-12">
      <Link href={`/jobs/${job.id}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-navy-500 hover:text-navy-800">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to listing
      </Link>
      <p className="eyebrow mt-6">Application</p>
      <h1 className="mt-1 text-3xl font-bold">{job.title}</h1>
      <p className="mt-1 text-navy-500">{job.employer.display_name} · {job.city}</p>

      <Alert tone="info" className="mt-6" title="What the employer will see">
        Only the information on this form. Don&apos;t include your home address, school schedule, Social Security number or bank details — TaskTeens never needs them.
      </Alert>

      {(errorList.length > 0 || errors._form) && (
        <div ref={errorSummaryRef} tabIndex={-1} role="alert" className="mt-6 rounded-2xl border border-coral-300 bg-coral-50 p-4 text-sm text-coral-900 focus:outline-none">
          <p className="font-semibold">{errors._form && !errorList.length ? errors._form : `Please fix ${errorList.length} ${errorList.length === 1 ? "field" : "fields"} below.`}</p>
          {errorList.length > 0 && (
            <ul className="mt-2 list-disc space-y-0.5 pl-5">
              {errorList.map(([k, v]) => (
                <li key={k}><a href={`#fld-${k}`} className="underline">{v}</a></li>
              ))}
            </ul>
          )}
        </div>
      )}

      <form onSubmit={submit} noValidate className="mt-8 space-y-8">
        <section className="card space-y-5 p-5 sm:p-6" aria-labelledby="sec-about">
          <h2 id="sec-about" className="text-lg font-bold">About you</h2>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Full name" required error={errors.applicant_name}>
              <input id="fld-applicant_name" className="input" value={form.applicant_name} onChange={(e) => set("applicant_name", e.target.value)} autoComplete="name" />
            </Field>
            <Field label="Age range" required error={errors.age_range}>
              <select id="fld-age_range" className="input" value={form.age_range} onChange={(e) => set("age_range", e.target.value as AgeRange)}>
                <option value="">Choose…</option>
                {AGE_RANGES.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </Field>
            <Field label="City" required error={errors.city} hint="City only — never your street address.">
              <input id="fld-city" className="input" list="city-list" value={form.city} onChange={(e) => set("city", e.target.value)} autoComplete="address-level2" />
            </Field>
            <datalist id="city-list">{CITIES.filter((c) => c !== "Remote").map((c) => <option key={c} value={c} />)}</datalist>
            <Field label="Email" required error={errors.applicant_email} hint="The employer will use this to contact you.">
              <input id="fld-applicant_email" type="email" className="input" value={form.applicant_email} onChange={(e) => set("applicant_email", e.target.value)} autoComplete="email" />
            </Field>
            <Field label="Phone number" required error={errors.applicant_phone} hint="Shared only with this employer.">
              <input id="fld-applicant_phone" type="tel" className="input" value={form.applicant_phone} onChange={(e) => set("applicant_phone", e.target.value)} autoComplete="tel" placeholder="(510) 555-0123" />
            </Field>
          </div>
          {tooYoung && <Alert tone="warn">This job lists a minimum age of {job.min_age}. You can still apply, but the employer may not be able to hire you yet.</Alert>}
        </section>

        <section className="card space-y-5 p-5 sm:p-6" aria-labelledby="sec-exp">
          <h2 id="sec-exp" className="text-lg font-bold">Experience &amp; skills</h2>
          <Field label="Relevant experience" required error={errors.experience} hint="Babysitting siblings, clubs, sports, volunteering and school projects all count.">
            <textarea id="fld-experience" className="input min-h-[110px]" value={form.experience} onChange={(e) => set("experience", e.target.value)} maxLength={1500} />
          </Field>
          <Field label="Skills" required error={errors.skills} hint="Press Enter after each skill.">
            <TagInput value={form.skills} onChange={(v) => set("skills", v)} suggestions={[...job.required_skills, ...job.preferred_skills]} id="fld-skills" />
          </Field>
          <Field label="Why are you interested in this job?" required error={errors.interest_statement} hint={`${form.interest_statement.length}/1200 characters — at least 30.`}>
            <textarea id="fld-interest_statement" className="input min-h-[120px]" value={form.interest_statement} onChange={(e) => set("interest_statement", e.target.value)} maxLength={1200} />
          </Field>
        </section>

        <section className="card space-y-5 p-5 sm:p-6" aria-labelledby="sec-logistics">
          <h2 id="sec-logistics" className="text-lg font-bold">Availability &amp; logistics</h2>
          <Field label="Availability" required error={errors.availability} hint={`This job: ${job.schedule}`}>
            <input id="fld-availability" className="input" value={form.availability} onChange={(e) => set("availability", e.target.value)} placeholder="e.g. Mon/Wed after 3:30, Saturday mornings" />
          </Field>
          <Field label="How would you get there?" required error={errors.transportation} hint={`Employer says: ${TRANSPORTATION_LABEL[job.transportation]}`}>
            <select id="fld-transportation" className="input" value={form.transportation} onChange={(e) => set("transportation", e.target.value as Transportation)}>
              <option value="">Choose…</option>
              {Object.entries(TRANSPORTATION_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="fld-resume" className="label">Résumé <span className="ml-1 text-xs font-normal text-navy-400">Optional</span></label>
              <label htmlFor="fld-resume" className={`flex cursor-pointer items-center gap-3 rounded-xl border border-dashed px-4 py-3 text-sm transition hover:border-bay-400 ${errors.resume ? "border-coral-400" : "border-navy-200"}`}>
                <FileUp className="h-5 w-5 text-navy-400" aria-hidden="true" />
                <span className="truncate">{resume ? resume.name : bundle?.profile?.resume_name ? `Using saved: ${bundle.profile.resume_name}` : "PDF or Word, up to 5 MB"}</span>
              </label>
              <input id="fld-resume" type="file" accept=".pdf,.doc,.docx" className="sr-only" onChange={(e) => { setResume(e.target.files?.[0] ?? null); setErrors((x) => ({ ...x, resume: "" })); }} aria-invalid={!!errors.resume} />
              {errors.resume && <p className="field-error">{errors.resume}</p>}
            </div>
            <Field label="Portfolio link" optional error={errors.portfolio_url}>
              <input id="fld-portfolio_url" type="url" className="input" value={form.portfolio_url} onChange={(e) => set("portfolio_url", e.target.value)} placeholder="https://" />
            </Field>
          </div>
        </section>

        <section className="card space-y-5 p-5 sm:p-6" aria-labelledby="sec-permits">
          <h2 id="sec-permits" className="text-lg font-bold">Work permit &amp; consent</h2>
          <p className="text-sm text-navy-500">{bundle?.settings.rules_note}</p>
          <FieldsetGroup legend="Work-permit status *" error={errors.work_permit_status}>
            <div id="fld-work_permit_status" className="grid gap-2 sm:grid-cols-2">
              {Object.entries(WORK_PERMIT_LABEL).map(([v, l]) => (
                <label key={v} className={`flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm ${form.work_permit_status === v ? "border-bay-400 bg-bay-50" : "border-navy-200 bg-white"}`}>
                  <input type="radio" name="work_permit" value={v} checked={form.work_permit_status === v} onChange={() => set("work_permit_status", v as WorkPermitStatus)} className="accent-bay-500" />
                  {l}
                </label>
              ))}
            </div>
          </FieldsetGroup>
          <FieldsetGroup legend={`Parent/guardian consent${minorConsentNeeded ? " *" : ""}`} error={errors.guardian_consent_status} hint={minorConsentNeeded ? "Required for applicants under 18." : "Optional if you're 18 or older."}>
            <div id="fld-guardian_consent_status" className="grid gap-2">
              {Object.entries(GUARDIAN_CONSENT_LABEL)
                .filter(([v]) => !(minorConsentNeeded && v === "not_applicable"))
                .map(([v, l]) => (
                  <label key={v} className={`flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm ${form.guardian_consent_status === v ? "border-bay-400 bg-bay-50" : "border-navy-200 bg-white"}`}>
                    <input type="radio" name="guardian" value={v} checked={form.guardian_consent_status === v} onChange={() => set("guardian_consent_status", v as GuardianConsentStatus)} className="accent-bay-500" />
                    {l}
                  </label>
                ))}
            </div>
          </FieldsetGroup>
          <div>
            <label className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 text-sm ${errors.agreed_to_safety_rules ? "border-coral-400 bg-coral-50" : "border-navy-200 bg-cream-100"}`}>
              <input id="fld-agreed_to_safety_rules" type="checkbox" checked={form.agreed_to_safety_rules} onChange={(e) => set("agreed_to_safety_rules", e.target.checked)} className="mt-0.5 h-4 w-4 accent-bay-500" aria-invalid={!!errors.agreed_to_safety_rules} />
              <span>
                <span className="font-semibold">I agree to the TaskTeens safety rules.</span> I&apos;ll meet in public or over video, tell a trusted adult about this job, never share sensitive personal information, and report anything that feels unsafe. <Link href="/safety" className="link" target="_blank">Read the rules</Link>
              </span>
            </label>
            {errors.agreed_to_safety_rules && <p className="field-error">{errors.agreed_to_safety_rules}</p>}
          </div>
        </section>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2 text-xs text-navy-500"><ShieldCheck className="h-4 w-4 text-emerald-600" aria-hidden="true" /> Sent directly to {job.employer.display_name}. No middleman.</p>
          <button type="submit" disabled={submitting} className="btn-coral btn-lg" aria-busy={submitting}>
            {submitting ? "Submitting…" : "Submit application"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Confirmation({ app, jobTitle, employer }: { app: Application; jobTitle: string; employer: string }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <div className="container-page max-w-2xl py-16">
      <div className="card animate-fade-up p-8 text-center sm:p-10">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
          <PartyPopper className="h-7 w-7" aria-hidden="true" />
        </span>
        <h1 ref={ref} tabIndex={-1} className="mt-4 text-3xl font-bold focus:outline-none">Application sent!</h1>
        <p className="mt-2 text-navy-600">Your application for <strong>{jobTitle}</strong> is now in <strong>{employer}</strong>&apos;s dashboard.</p>
        <ul className="mx-auto mt-6 max-w-sm space-y-2 text-left text-sm text-navy-600">
          <li className="flex gap-2"><CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" aria-hidden="true" /> The employer was notified by email.</li>
          <li className="flex gap-2"><Mail className="h-5 w-5 shrink-0 text-emerald-500" aria-hidden="true" /> A confirmation was sent to {app.applicant_email}.</li>
          <li className="flex gap-2"><CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" aria-hidden="true" /> You&apos;ll get a notification each time your status changes.</li>
        </ul>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/dashboard/teen/applications" className="btn-primary">Track my application</Link>
          <Link href="/jobs" className="btn-outline">Find more jobs</Link>
        </div>
      </div>
    </div>
  );
}
