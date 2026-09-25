"use client";
import { Briefcase, GraduationCap } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
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
  const [role, setRole] = useState<"teen" | "employer" | "">((sp.get("role") as "teen" | "employer") ?? "");
  const [full_name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agree, setAgree] = useState(false);
  const [ageOk, setAgeOk] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = signUpSchema.safeParse({ full_name, email, password, role, agree });
    const errs = parsed.success ? {} : fieldErrors(parsed.error);
    if (role === "teen" && !ageOk) errs.age_confirm = "Please confirm you're at least 14.";
    if (Object.keys(errs).length || !parsed.success) return setErrors(errs);
    setBusy(true);
    setErrors({});
    try {
      const { needsEmailVerification } = await data.signUp({ full_name, email, password, role: parsed.data.role });
      if (needsEmailVerification) {
        router.push(`/auth/verify?email=${encodeURIComponent(email)}`);
        return;
      }
      await refresh();
      const dest = role === "employer" ? `/onboarding/employer${next ? `?next=${encodeURIComponent(next)}` : ""}` : next ?? "/dashboard/teen/profile";
      router.push(dest);
    } catch (err) {
      setErrors({ _form: errorMessage(err) });
      setBusy(false);
    }
  };

  const roles = [
    { value: "teen" as const, icon: GraduationCap, title: "I'm a teen", body: "Find local jobs, ages 14–19" },
    { value: "employer" as const, icon: Briefcase, title: "I'm hiring", body: "Family, individual or business" },
  ];

  return (
    <AuthCard title="Create your account" subtitle="Free to join. Takes about a minute." footer={<>Already have an account? <Link href="/auth/sign-in" className="link">Sign in</Link></>}>
      <form onSubmit={submit} noValidate className="space-y-5">
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
          <p className="mt-2 text-xs text-navy-400">Administrator accounts can&apos;t be created here.</p>
        </fieldset>
        <Field label={role === "employer" ? "Your name" : "Full name"} required error={errors.full_name}>
          <input className="input" value={full_name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        </Field>
        <Field label="Email" required error={errors.email}>
          <input type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </Field>
        <Field label="Password" required error={errors.password} hint="At least 8 characters with a letter and a number.">
          <input type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        </Field>
        {role === "teen" && (
          <div>
            <label className="flex items-start gap-2.5 text-sm">
              <input type="checkbox" checked={ageOk} onChange={(e) => setAgeOk(e.target.checked)} className="mt-0.5 h-4 w-4 accent-bay-500" />
              <span>I&apos;m at least 14 years old, and I&apos;ll let a parent or guardian know I&apos;m using TaskTeens.</span>
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
        {errors._form && <Alert tone="error">{errors._form}</Alert>}
        <button type="submit" disabled={busy} className="btn-primary w-full">{busy ? "Creating account…" : "Create account"}</button>
      </form>
    </AuthCard>
  );
}
