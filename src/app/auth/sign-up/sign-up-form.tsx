"use client";
import { Briefcase, GraduationCap } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import { Captcha, type CaptchaHandle } from "@/components/auth/captcha";
import { captchaEnabled } from "@/lib/config";
import { AuthCard } from "@/components/layout/auth-card";
import { Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { useAuth } from "@/lib/auth-context";
import { fieldErrors, signUpSchema } from "@/lib/validation";
import { cn, errorMessage } from "@/lib/utils";
import { safeNext } from "../sign-in/sign-in-form";

export function SignUpForm() {
  const { data, refresh } = useAuth();
  const router = useRouter();
  const sp = useSearchParams();
  const next = safeNext(sp.get("next"));
  // Parent/guardian accounts are only created from an invitation link (role=parent&email=…).
  const parentMode = sp.get("role") === "parent";
  const [role, setRole] = useState<"teen" | "employer" | "parent" | "">(parentMode ? "parent" : ((sp.get("role") as "teen" | "employer") ?? ""));
  const [full_name, setName] = useState("");
  const [email, setEmail] = useState(parentMode ? sp.get("email") ?? "" : "");
  const [password, setPassword] = useState("");
  const [agree, setAgree] = useState(false);
  const [parentName, setParentName] = useState("");
  const [parentEmail, setParentEmail] = useState("");
  const [parentPhone, setParentPhone] = useState("");
  const [ageOk, setAgeOk] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const captcha = useRef<CaptchaHandle>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = signUpSchema.safeParse({ full_name, email, password, role, agree });
    const errs = parsed.success ? {} : fieldErrors(parsed.error);
    if (role === "teen" && !ageOk) errs.age_confirm = "Please confirm you're at least 14.";
    const parentDigits = parentPhone.replace(/\D/g, "");
    if (role === "teen") {
      if (parentName.trim().length < 2) errs.parent_name = "Enter your parent or guardian's name.";
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(parentEmail.trim())) errs.parent_email = "Enter your parent or guardian's email.";
      else if (parentEmail.trim().toLowerCase() === email.trim().toLowerCase()) errs.parent_email = "Use your parent or guardian's own email, not yours.";
      if (!(parentDigits.length === 10 || (parentDigits.length === 11 && parentDigits.startsWith("1")))) errs.parent_phone = "Enter a 10-digit phone number, e.g. (510) 555-0123.";
    }
    if (captchaEnabled && !captchaToken) errs.captcha = "Please complete the security check.";
    if (Object.keys(errs).length || !parsed.success) return setErrors(errs);
    setBusy(true);
    setErrors({});
    try {
<<<<<<< HEAD
      const { needsEmailVerification } = await data.signUp({ full_name, email, password, role: parsed.data.role, captchaToken, next,
        parent: role === "teen" ? { name: parentName.trim(), email: parentEmail.trim().toLowerCase(), phone: `+1${parentDigits.slice(-10)}` } : null });
=======
      const { needsEmailVerification } = await data.signUp({ full_name, email, password, role: parsed.data.role, captchaToken, next });
>>>>>>> 3e1cd4106bc8ed94a84e04cc9b624fcfd5c621d7
      if (needsEmailVerification) {
        router.push(`/auth/verify?email=${encodeURIComponent(email)}`);
        return;
      }
      // Email confirmation is off: the teen is already signed in, so send the parent invitation now.
      if (role === "teen") await fetch("/api/parent-invitations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ auto: true }) }).catch(() => undefined);
      await refresh();
      const dest = role === "parent" ? next ?? "/dashboard/parent" : role === "employer" ? `/onboarding/employer${next ? `?next=${encodeURIComponent(next)}` : ""}` : next ?? "/dashboard/teen/profile";
      router.push(dest);
    } catch (err) {
      setErrors({ _form: errorMessage(err) });
      captcha.current?.reset();
      setBusy(false);
    }
  };

  const roles = [
    { value: "teen" as const, icon: GraduationCap, title: "I'm a teen", body: "Jobs, internships & volunteering, ages 14–19" },
    { value: "employer" as const, icon: Briefcase, title: "I'm hiring", body: "Family, business or nonprofit" },
  ];

  return (
    <AuthCard
      title={parentMode ? "Create your parent account" : "Create your account"}
      subtitle={parentMode ? "A separate account for you as parent or guardian — you never sign in as your teen." : "Free to join. Takes about a minute."}
      footer={<>Already have an account? <Link href={`/auth/sign-in${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="link">Sign in</Link></>}
    >
      <form onSubmit={submit} noValidate className="space-y-5">
        {parentMode ? (
          <Alert tone="info">Use the email address the invitation was sent to. You&apos;ll confirm it, then come back to review consent.</Alert>
        ) : (
        <fieldset>
          <legend className="label">Account type</legend>
          <div className="grid grid-cols-2 gap-3">
            {roles.map((r) => (
              <label key={r.value} className={cn("flex cursor-pointer flex-col rounded-2xl border-2 p-4 transition", role === r.value ? "border-bay-500 bg-bay-50" : "border-navy-100 bg-white hover:border-navy-200")}>
                <input type="radio" name="role" value={r.value} checked={role === r.value} onChange={() => setRole(r.value)} className="sr-only" />
                <r.icon className={cn("h-6 w-6", role === r.value ? "text-bay-600" : "text-navy-400")} aria-hidden="true" />
                <span className="mt-2 text-sm font-semibold">{r.title}</span>
                <span className="text-xs text-navy-500">{r.body}</span>
              </label>
            ))}
          </div>
          {errors.role && <p className="field-error">{errors.role}</p>}
          <p className="mt-2 text-xs text-navy-400">Parents and guardians: use the invitation link your teen sent you. Administrator accounts can&apos;t be created here.</p>
        </fieldset>
        )}
        <Field label={role === "employer" ? "Your name" : "Full name"} required error={errors.full_name}>
          <input className="input" value={full_name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        </Field>
        <Field label="Email" required error={errors.email}>
          <input type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" readOnly={parentMode && !!sp.get("email")} />
        </Field>
        <Field label="Password" required error={errors.password} hint="At least 8 characters with a letter and a number.">
          <input type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        </Field>
        {role === "teen" && (
          <fieldset className="space-y-3 rounded-2xl border border-navy-100 bg-cream-50 p-4">
            <legend className="px-1 text-sm font-semibold">Your parent or guardian</legend>
            <p className="text-xs text-navy-500">We&apos;ll email them an invitation once you confirm your email. They create their own account, approve every job, and can read your TaskTeens messages. You can&apos;t apply until they confirm.</p>
            <Field label="Their name" required error={errors.parent_name}><input className="input" value={parentName} onChange={(e) => setParentName(e.target.value)} autoComplete="off" maxLength={80} /></Field>
            <Field label="Their email" required error={errors.parent_email}><input type="email" className="input" value={parentEmail} onChange={(e) => setParentEmail(e.target.value)} autoComplete="off" /></Field>
            <Field label="Their phone" required error={errors.parent_phone} hint="Private. Used for safety alerts — never shared with employers."><input type="tel" className="input" value={parentPhone} onChange={(e) => setParentPhone(e.target.value)} autoComplete="off" placeholder="(510) 555-0123" /></Field>
          </fieldset>
        )}
        {role === "teen" && (
          <div>
            <label className="flex items-start gap-2.5 text-sm">
              <input type="checkbox" checked={ageOk} onChange={(e) => setAgeOk(e.target.checked)} className="mt-0.5 h-4 w-4 accent-bay-500" />
              <span>I&apos;m at least 14 years old, and my parent or guardian knows I&apos;m signing up.</span>
            </label>
            {errors.age_confirm && <p className="field-error">{errors.age_confirm}</p>}
          </div>
        )}
        <div>
          <label className="flex items-start gap-2.5 text-sm">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 h-4 w-4 accent-bay-500" />
            <span>I agree to the <Link href="/terms" className="link" target="_blank">Terms</Link>, <Link href="/privacy" className="link" target="_blank">Privacy Policy</Link> and <Link href="/guidelines" className="link" target="_blank">Community Guidelines</Link>.</span>
          </label>
          {errors.agree && <p className="field-error">{errors.agree}</p>}
        </div>
        <Captcha ref={captcha} action="signup" onToken={(t) => { setCaptchaToken(t); if (t) setErrors((e) => ({ ...e, captcha: "" })); }} error={errors.captcha} />
        {errors._form && <Alert tone="error">{errors._form}</Alert>}
        <button type="submit" disabled={busy} className="btn-primary w-full">{busy ? "Creating account…" : "Create account"}</button>
      </form>
    </AuthCard>
  );
}
