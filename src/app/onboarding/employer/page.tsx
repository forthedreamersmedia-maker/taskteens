"use client";
import { BadgeCheck, Building2, UserRound } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { RequireRole } from "@/components/layout/require-role";
import { Field } from "@/components/ui/field";
import { Alert, PageLoader } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/lib/auth-context";
import { useAsync } from "@/lib/hooks/use-async";
import { CITIES, SERVICE_AREAS } from "@/lib/constants";
import type { EmployerOnboardingInput, EmployerType } from "@/lib/types";
import { employerOnboardingSchema, fieldErrors } from "@/lib/validation";
import { cn, errorMessage } from "@/lib/utils";
import { safeNext } from "@/app/auth/sign-in/sign-in-form";

function Onboarding() {
  const { data, session } = useAuth();
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const toast = useToast();
  const { data: existing, loading } = useAsync(() => data.getEmployerProfile(), []);
  const [step, setStep] = useState(1);
  const [f, setF] = useState<EmployerOnboardingInput>({
    employer_type: "individual", display_name: "", phone: "", city: "", service_area: "", website: "", description: "",
    request_verification: true, legal_name: "", business_registration: "", verification_notes: "", agreed_to_rules: false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (existing)
      setF((x) => ({ ...x, employer_type: existing.employer_type, display_name: existing.display_name, city: existing.city, service_area: existing.service_area ?? "", website: existing.website ?? "", description: existing.description ?? "", request_verification: existing.verification_status === "unverified" || existing.verification_status === "rejected" }));
    if (session) setF((x) => ({ ...x, phone: x.phone || session.user.phone || "", legal_name: x.legal_name || session.user.full_name }));
  }, [existing, session]);

  if (loading) return <PageLoader />;
  const set = <K extends keyof EmployerOnboardingInput>(k: K, v: EmployerOnboardingInput[K]) => { setF((x) => ({ ...x, [k]: v })); setErrors((e) => ({ ...e, [k]: "" })); };

  const stepFields: Record<number, (keyof EmployerOnboardingInput)[]> = {
    1: ["employer_type", "display_name", "phone", "city", "service_area", "website", "description"],
    2: ["request_verification", "legal_name", "business_registration", "verification_notes"],
    3: ["agreed_to_rules"],
  };
  const validate = (upTo: number) => {
    const parsed = employerOnboardingSchema.safeParse(f);
    if (parsed.success) return true;
    const all = fieldErrors(parsed.error);
    const relevant = Object.fromEntries(Object.entries(all).filter(([k]) => Object.entries(stepFields).some(([s, fs]) => Number(s) <= upTo && fs.includes(k as keyof EmployerOnboardingInput))));
    setErrors(relevant);
    return Object.keys(relevant).length === 0;
  };

  const finish = async () => {
    if (!validate(3)) return;
    setBusy(true);
    try {
      await data.saveEmployerOnboarding(f);
      toast({ tone: "success", title: "Employer profile ready", body: f.request_verification ? "Your verification request is pending admin review." : undefined });
      router.push(next ?? "/dashboard/employer");
    } catch (e) {
      setErrors({ _form: errorMessage(e) });
      setBusy(false);
    }
  };

  const types: { v: EmployerType; icon: typeof UserRound; t: string; b: string }[] = [
    { v: "individual", icon: UserRound, t: "Individual or family", b: "Hiring for your household" },
    { v: "business", icon: Building2, t: "Business or organization", b: "Shop, café, nonprofit, etc." },
  ];

  return (
    <div className="container-page max-w-2xl py-10">
      <p className="eyebrow">Employer setup · Step {step} of 3</p>
      <h1 className="mt-1 text-3xl font-bold">{step === 1 ? "Tell teens who you are" : step === 2 ? "Verification (optional)" : "Safety & conduct rules"}</h1>
      <div className="mt-4 flex gap-1.5" aria-hidden="true">{[1, 2, 3].map((s) => <span key={s} className={cn("h-1.5 flex-1 rounded-full", s <= step ? "bg-coral-500" : "bg-navy-100")} />)}</div>

      <div className="card mt-6 space-y-5 p-5 sm:p-6">
        {step === 1 && (
          <>
            <fieldset>
              <legend className="label">Account type</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {types.map((t) => (
                  <label key={t.v} className={cn("flex cursor-pointer items-start gap-3 rounded-2xl border-2 p-4", f.employer_type === t.v ? "border-coral-400 bg-coral-50" : "border-navy-100")}>
                    <input type="radio" name="etype" className="sr-only" checked={f.employer_type === t.v} onChange={() => set("employer_type", t.v)} />
                    <t.icon className="h-5 w-5 text-coral-500" aria-hidden="true" />
                    <span><span className="block text-sm font-semibold">{t.t}</span><span className="text-xs text-navy-500">{t.b}</span></span>
                  </label>
                ))}
              </div>
            </fieldset>
            <Field label={f.employer_type === "business" ? "Business name" : "Name shown to teens"} required error={errors.display_name} hint={f.employer_type === "individual" ? "e.g. “The Nguyen Family” or “Linh N.”" : undefined}>
              <input className="input" value={f.display_name} onChange={(e) => set("display_name", e.target.value)} />
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Email" hint="Your sign-in email. Private."><input className="input" value={session?.user.email ?? ""} disabled /></Field>
              <Field label="Phone" required error={errors.phone} hint="Private — for TaskTeens support only."><input type="tel" className="input" value={f.phone} onChange={(e) => set("phone", e.target.value)} autoComplete="tel" /></Field>
              <Field label="City" required error={errors.city}>
                <select className="input" value={f.city} onChange={(e) => set("city", e.target.value)}>
                  <option value="">Choose…</option>
                  {CITIES.filter((c) => c !== "Remote").map((c) => <option key={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Service area" required error={errors.service_area}>
                <select className="input" value={f.service_area} onChange={(e) => set("service_area", e.target.value)}>
                  <option value="">Choose…</option>
                  {SERVICE_AREAS.map((a) => <option key={a.slug} value={a.slug}>{a.name}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Website or social link" optional error={errors.website}><input type="url" className="input" value={f.website} onChange={(e) => set("website", e.target.value)} placeholder="https://" /></Field>
            <Field label="Short description" required error={errors.description} hint="What you do and what it's like to work with you. Don't include your home address.">
              <textarea className="input min-h-[100px]" maxLength={1000} value={f.description} onChange={(e) => set("description", e.target.value)} />
            </Field>
          </>
        )}
        {step === 2 && (
          <>
            <Alert tone="info" title="How verification works">
              A TaskTeens administrator manually reviews what you submit here. If approved, a &ldquo;Verified profile&rdquo; badge appears on your listings. This is a pending-review workflow — <strong>not</strong> a background check or legal verification.
            </Alert>
            <label className="flex items-center gap-3 text-sm font-medium">
              <input type="checkbox" className="h-4 w-4 accent-coral-500" checked={f.request_verification} onChange={(e) => set("request_verification", e.target.checked)} />
              <BadgeCheck className="h-4 w-4 text-bay-500" aria-hidden="true" /> Request a profile review
            </label>
            {f.request_verification && (
              <>
                <Field label={f.employer_type === "business" ? "Registered business name" : "Your legal name"} required error={errors.legal_name}><input className="input" value={f.legal_name} onChange={(e) => set("legal_name", e.target.value)} /></Field>
                {f.employer_type === "business" && (
                  <Field label="Business license or registration" optional hint="e.g. “City of Berkeley business license” — no tax ID numbers needed."><input className="input" value={f.business_registration} onChange={(e) => set("business_registration", e.target.value)} /></Field>
                )}
                <Field label="Anything that helps us review" optional><textarea className="input min-h-[80px]" value={f.verification_notes} onChange={(e) => set("verification_notes", e.target.value)} placeholder="e.g. links to reviews, a school or community connection, availability for a short video call" /></Field>
              </>
            )}
          </>
        )}
        {step === 3 && (
          <>
            <ul className="space-y-2 text-sm text-navy-700">
              {[
                "I will follow all laws that apply to employing minors, including work hours, breaks, permitted tasks and minimum wage.",
                "I will interview only by video, phone or in a public place, and welcome a parent or guardian.",
                "I will never ask applicants for Social Security numbers, bank logins, ID numbers or any payment.",
                "I will keep exact addresses private until a hire is confirmed and share only what's needed.",
                "For in-home jobs, a responsible adult will be present or reachable.",
                "I will treat applicants respectfully and update their status promptly.",
                "I understand TaskTeens may pause or remove listings and suspend accounts that break these rules.",
              ].map((r) => <li key={r} className="flex gap-2"><span className="text-coral-500" aria-hidden="true">•</span>{r}</li>)}
            </ul>
            <label className={cn("flex items-start gap-3 rounded-2xl border p-4 text-sm", errors.agreed_to_rules ? "border-coral-400 bg-coral-50" : "border-navy-200 bg-cream-100")}>
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-coral-500" checked={f.agreed_to_rules} onChange={(e) => set("agreed_to_rules", e.target.checked as true)} />
              <span>I agree to the TaskTeens <Link href="/guidelines#employers" target="_blank" className="link">employer safety and conduct rules</Link> and <Link href="/terms" target="_blank" className="link">Terms</Link>.</span>
            </label>
            {errors.agreed_to_rules && <p className="field-error">{errors.agreed_to_rules}</p>}
          </>
        )}
        {errors._form && <Alert tone="error">{errors._form}</Alert>}
        <div className="flex justify-between gap-3 pt-2">
          {step > 1 ? <button type="button" className="btn-outline" onClick={() => setStep(step - 1)}>Back</button> : <span />}
          {step < 3 ? (
            <button type="button" className="btn-primary" onClick={() => validate(step) && setStep(step + 1)}>Continue</button>
          ) : (
            <button type="button" className="btn-coral" disabled={busy} onClick={finish}>{busy ? "Saving…" : "Finish setup"}</button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <RequireRole roles={["employer"]}>
      <Suspense><Onboarding /></Suspense>
    </RequireRole>
  );
}
