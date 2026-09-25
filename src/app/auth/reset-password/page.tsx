"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthCard } from "@/components/layout/auth-card";
import { Field } from "@/components/ui/field";
import { Alert, PageLoader } from "@/components/ui/feedback";
import { dashboardPathFor, useAuth } from "@/lib/auth-context";
import { errorMessage } from "@/lib/utils";

export default function ResetPasswordPage() {
  const { data, session, loading } = useAuth();
  const router = useRouter();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  if (loading) return <PageLoader />;
  if (!session)
    return (
      <AuthCard title="Link expired or invalid" subtitle="Open the newest reset link from your email, or request another one.">
        <Link href="/auth/forgot-password" className="btn-primary w-full">Request a new link</Link>
      </AuthCard>
    );
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.length < 8 || !/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return setError("Use at least 8 characters with a letter and a number.");
    if (pw !== pw2) return setError("Passwords don't match.");
    setBusy(true);
    try {
      await data.updatePassword(pw);
      setDone(true);
      setTimeout(() => router.push(dashboardPathFor(session.user.role)), 1200);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthCard title="Choose a new password">
      {done ? (
        <Alert tone="success" title="Password updated">Taking you to your dashboard…</Alert>
      ) : (
        <form onSubmit={submit} noValidate className="space-y-4">
          <Field label="New password" required><input type="password" className="input" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" /></Field>
          <Field label="Confirm new password" required><input type="password" className="input" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" /></Field>
          {error && <Alert tone="error">{error}</Alert>}
          <button type="submit" disabled={busy} className="btn-primary w-full">{busy ? "Saving…" : "Update password"}</button>
        </form>
      )}
    </AuthCard>
  );
}
