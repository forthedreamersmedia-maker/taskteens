"use client";
import { Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { AuthCard } from "@/components/layout/auth-card";
import { Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { dashboardPathFor, useAuth } from "@/lib/auth-context";
import { isDemoMode } from "@/lib/config";
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "@/lib/data/seed";
import { errorMessage } from "@/lib/utils";

/** Only allow same-site relative redirects. */
export function safeNext(next: string | null) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : null;
}

export function SignInForm() {
  const { data, refresh } = useAuth();
  const router = useRouter();
  const sp = useSearchParams();
  const next = safeNext(sp.get("next"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const doSignIn = async (em: string, pw: string) => {
    setBusy(true);
    setError(null);
    try {
      const s = await data.signIn(em, pw);
      await refresh();
      const dest = next && !(next.startsWith("/dashboard/employer") && s.user.role !== "employer") && !(next.startsWith("/admin") && s.user.role !== "admin") ? next : dashboardPathFor(s.user.role);
      router.push(dest);
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return setError("Enter your email and password.");
    doSignIn(email, password);
  };

  return (
    <AuthCard
      title="Welcome back"
      subtitle="Sign in to your TaskTeens account."
      footer={<>New to TaskTeens? <Link href={`/auth/sign-up${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="link">Create an account</Link></>}
    >
      {isDemoMode && (
        <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-900">Demo mode — try an account</p>
          <div className="mt-3 grid gap-2">
            {DEMO_ACCOUNTS.map((a) => (
              <button key={a.email} type="button" disabled={busy} onClick={() => doSignIn(a.email, DEMO_PASSWORD)} className="btn-outline btn-sm justify-between">
                <span>{a.label}</span>
                <span className="text-navy-400">{a.email.split("@")[0]}</span>
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-amber-800">Password for all demo accounts: <code className="font-mono">{DEMO_PASSWORD}</code></p>
        </div>
      )}
      <form onSubmit={submit} noValidate className="space-y-4">
        <Field label="Email" required>
          <input type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </Field>
        <Field label="Password" required>
          <div className="relative">
            <input id="password" type={show ? "text" : "password"} className="input pr-11" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            <button type="button" onClick={() => setShow((s) => !s)} className="absolute inset-y-0 right-0 flex items-center px-3 text-navy-400 hover:text-navy-700" aria-label={show ? "Hide password" : "Show password"}>
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </Field>
        <div className="flex justify-end">
          <Link href="/auth/forgot-password" className="text-sm font-medium text-bay-600 hover:underline">Forgot password?</Link>
        </div>
        {error && <Alert tone="error">{error}</Alert>}
        <button type="submit" disabled={busy} className="btn-primary w-full">{busy ? "Signing in…" : "Sign in"}</button>
      </form>
    </AuthCard>
  );
}
