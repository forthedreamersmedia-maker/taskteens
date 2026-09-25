"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { Captcha, type CaptchaHandle } from "@/components/auth/captcha";
import { AuthCard } from "@/components/layout/auth-card";
import { Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { useData } from "@/lib/auth-context";
import { captchaEnabled, isDemoMode } from "@/lib/config";
import { errorMessage } from "@/lib/utils";

export default function ForgotPasswordPage() {
  const data = useData();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const captcha = useRef<CaptchaHandle>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError("Enter a valid email address.");
    if (captchaEnabled && !isDemoMode && !captchaToken) return setError("Please complete the security check.");
    setBusy(true);
    setError(null);
    try {
      await data.requestPasswordReset(email, captchaToken);
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
      captcha.current?.reset();
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthCard title="Reset your password" subtitle="We'll email you a secure link to choose a new one." footer={<Link href="/auth/sign-in" className="link">Back to sign in</Link>}>
      {sent ? (
        <Alert tone="success" title="Check your email">
          If an account exists for {email}, a reset link is on its way.{" "}
          {isDemoMode && <>In demo mode, the email appears in the <Link href="/demo" className="underline">demo outbox</Link>, or go straight to <Link href="/auth/reset-password" className="underline">reset password</Link> after signing in.</>}
        </Alert>
      ) : (
        <form onSubmit={submit} noValidate className="space-y-4">
          <Field label="Email" required error={error ?? undefined}>
            <input type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </Field>
          {!isDemoMode && <Captcha ref={captcha} action="reset" onToken={setCaptchaToken} />}
          <button type="submit" disabled={busy} className="btn-primary w-full">{busy ? "Sending…" : "Send reset link"}</button>
        </form>
      )}
    </AuthCard>
  );
}
