"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthCard } from "@/components/layout/auth-card";
import { Field } from "@/components/ui/field";
import { Alert, PageLoader } from "@/components/ui/feedback";
import { isDemoMode } from "@/lib/config";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { errorMessage } from "@/lib/utils";
import { safeNext } from "../sign-in/sign-in-form";

type Stage = { kind: "loading" } | { kind: "enroll"; factorId: string; qr: string; secret: string } | { kind: "verify"; factorId: string } | { kind: "error"; message: string };

/**
 * Administrator two-step verification (Supabase TOTP).
 * Admin database access (RLS + admin RPCs) requires an aal2 session, so admins land here after password sign-in.
 */
export function MfaForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const next = safeNext(sp.get("next")) ?? "/admin";
  const [stage, setStage] = useState<Stage>({ kind: "loading" });
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isDemoMode) return;
    const supabase = getBrowserSupabase();
    (async () => {
      try {
        const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (aal?.currentLevel === "aal2") { router.replace(next); return; }
        const { data: factors, error: fErr } = await supabase.auth.mfa.listFactors();
        if (fErr) throw fErr;
        const verified = factors?.totp?.find((f) => f.status === "verified");
        if (verified) { setStage({ kind: "verify", factorId: verified.id }); return; }
        // Clean up abandoned enrolment attempts, then start a new one.
        const all = (factors?.all ?? []) as { id: string; status: string; factor_type: string }[];
        for (const f of all.filter((x) => x.factor_type === "totp" && x.status !== "verified")) await supabase.auth.mfa.unenroll({ factorId: f.id });
        const { data: en, error: eErr } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `TaskTeens admin ${new Date().toISOString().slice(0, 10)}` });
        if (eErr) throw eErr;
        setStage({ kind: "enroll", factorId: en.id, qr: en.totp.qr_code, secret: en.totp.secret });
      } catch (e) {
        setStage({ kind: "error", message: errorMessage(e) });
      }
    })();
  }, [next, router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (stage.kind !== "enroll" && stage.kind !== "verify") return;
    if (!/^\d{6}$/.test(code.trim())) return setError("Enter the 6-digit code from your authenticator app.");
    setBusy(true);
    setError(null);
    try {
      const { error: vErr } = await getBrowserSupabase().auth.mfa.challengeAndVerify({ factorId: stage.factorId, code: code.trim() });
      if (vErr) throw vErr;
      router.replace(next);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  if (isDemoMode) {
    return <AuthCard title="Two-step verification" subtitle="Administrator accounts"><Alert tone="info">Two-step verification requires the live Supabase backend. It is not used in demo mode.</Alert></AuthCard>;
  }
  if (stage.kind === "loading") return <PageLoader label="Checking two-step verification…" />;

  return (
    <AuthCard title="Two-step verification" subtitle="Administrator accounts must confirm a code from an authenticator app.">
      {stage.kind === "error" && (
        <Alert tone="error" title="Two-step verification is unavailable">
          {stage.message}. Make sure TOTP multi-factor authentication is enabled in Supabase (Authentication → Multi-Factor).
        </Alert>
      )}
      {stage.kind === "enroll" && (
        <div className="mb-5 space-y-3 text-sm text-navy-600">
          <p>Scan this QR code with an authenticator app (Google Authenticator, 1Password, Authy…), then enter the 6-digit code.</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={stage.qr} alt="QR code for your authenticator app" className="mx-auto h-48 w-48 rounded-xl border border-navy-100 bg-white p-2" />
          <p className="text-xs">Can&apos;t scan? Enter this key: <code className="break-all font-mono">{stage.secret}</code></p>
        </div>
      )}
      {(stage.kind === "enroll" || stage.kind === "verify") && (
        <form onSubmit={submit} noValidate className="space-y-4">
          <Field label="6-digit code" required>
            <input className="input text-center font-mono text-lg tracking-[0.4em]" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
          </Field>
          {error && <Alert tone="error">{error}</Alert>}
          <button type="submit" disabled={busy} className="btn-primary w-full">{busy ? "Verifying…" : "Verify"}</button>
        </form>
      )}
    </AuthCard>
  );
}
