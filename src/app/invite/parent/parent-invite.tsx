"use client";
import { CheckCircle2, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthCard } from "@/components/layout/auth-card";
import { Alert, PageLoader } from "@/components/ui/feedback";
import { useAuth } from "@/lib/auth-context";
import { isDemoMode } from "@/lib/config";
import { CONSENT_STATEMENTS, LOCATION_CONSENT_TEXT } from "@/lib/safety/consent";

interface Preview { teenFirstName: string; parentName: string; parentEmail: string; status: string; expiresAt: string }

export function ParentInvite() {
  const sp = useSearchParams();
  const router = useRouter();
  const token = sp.get("token") ?? "";
  const { session, loading, data } = useAuth();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [allowLocation, setAllowLocation] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (isDemoMode) return;
    fetch(`/api/parent-invitations/preview?token=${encodeURIComponent(token)}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "This invitation link is not valid.");
        setPreview(j);
      })
      .catch((e: Error) => setError(e.message));
  }, [token]);

  if (isDemoMode) return <AuthCard title="Parent invitation"><Alert tone="info">Parent invitations require the live backend and aren&apos;t available in demo mode.</Alert></AuthCard>;
  if (error) return <AuthCard title="Parent invitation"><Alert tone="error">{error}</Alert></AuthCard>;
  if (!preview || loading) return <PageLoader label="Opening invitation…" />;

  const here = `/invite/parent?token=${encodeURIComponent(token)}`;
  const t = preview.teenFirstName;

  if (done) {
    return (
      <AuthCard title="Thank you — you're linked">
        <div className="space-y-4 text-sm text-navy-600">
          <p className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" /> {t}&apos;s account now shows <strong>Parent confirmed</strong>. You&apos;ll be asked to approve each job before it&apos;s confirmed.</p>
          <Link href="/dashboard/parent" className="btn-primary w-full">Go to my parent dashboard</Link>
        </div>
      </AuthCard>
    );
  }

  if (preview.status !== "pending") {
    const msg = preview.status === "accepted" ? "This invitation was already accepted." : preview.status === "expired" ? `This invitation has expired. Ask ${t} to send a new one from their dashboard.` : `This invitation was replaced by a newer one. Use the most recent email from ${t}.`;
    return <AuthCard title="Parent invitation"><Alert tone="warn">{msg}</Alert>{preview.status === "accepted" && <Link href="/dashboard/parent" className="btn-outline mt-4 w-full">Parent dashboard</Link>}</AuthCard>;
  }

  const intro = (
    <div className="mb-5 space-y-3 text-sm text-navy-600">
      <p><strong>{t}</strong> listed you ({preview.parentName}) as their parent or guardian on TaskTeens, a local pilot connecting teens with household jobs in Berkeley, Albany, El Cerrito and nearby.</p>
      <p>Nothing happens without your consent. If you don&apos;t know {t}, close this page.</p>
    </div>
  );

  if (!session) {
    return (
      <AuthCard title={`${t} invited you to TaskTeens`} subtitle="Create a separate parent/guardian account to review and respond.">
        {intro}
        <div className="grid gap-2">
          <Link href={`/auth/sign-up?role=parent&email=${encodeURIComponent(preview.parentEmail)}&next=${encodeURIComponent(here)}`} className="btn-primary w-full">Create a parent account</Link>
          <Link href={`/auth/sign-in?next=${encodeURIComponent(here)}`} className="btn-outline w-full">I already have a parent account</Link>
        </div>
        <p className="mt-3 text-xs text-navy-400">Use {preview.parentEmail} — the address this invitation was sent to.</p>
      </AuthCard>
    );
  }

  if (session.user.role !== "parent") {
    return (
      <AuthCard title="Parent invitation">
        <Alert tone="warn" title="You're signed in with a different account type">
          This invitation needs a parent/guardian account. Sign out, then open this link again.
        </Alert>
        <button type="button" className="btn-outline mt-4 w-full" onClick={async () => { await data.signOut(); router.refresh(); }}>Sign out</button>
      </AuthCard>
    );
  }

  const allChecked = CONSENT_STATEMENTS.every((s) => checked[s.id]);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!allChecked) return setError("Please confirm every statement, or close this page if you don't consent.");
    setBusy(true);
    try {
      const r = await fetch("/api/parent-invitations/accept", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, statements: CONSENT_STATEMENTS.filter((s) => checked[s.id]).map((s) => s.id), allow_location: allowLocation }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Could not record consent.");
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <AuthCard title={`Consent for ${t}`} subtitle="Read each statement. Check it only if it's true for you.">
      {intro}
      <form onSubmit={submit} className="space-y-4" noValidate>
        <fieldset className="space-y-3">
          <legend className="sr-only">Consent statements</legend>
          {CONSENT_STATEMENTS.map((s) => (
            <label key={s.id} className="flex items-start gap-2.5 text-sm">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-bay-500" checked={!!checked[s.id]} onChange={(e) => setChecked((c) => ({ ...c, [s.id]: e.target.checked }))} />
              <span>
                {s.text}
                {s.id === "draft_terms" && <> (<Link href="/terms" target="_blank" className="link">Terms</Link> · <Link href="/privacy" target="_blank" className="link">Privacy</Link>)</>}
              </span>
            </label>
          ))}
        </fieldset>
        <label className="flex items-start gap-2.5 rounded-2xl border border-navy-100 bg-cream-50 p-3 text-sm">
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-bay-500" checked={allowLocation} onChange={(e) => setAllowLocation(e.target.checked)} />
          <span>{LOCATION_CONSENT_TEXT}</span>
        </label>
        {error && <Alert tone="error">{error}</Alert>}
        <button type="submit" disabled={busy || !allChecked} className="btn-primary w-full"><ShieldCheck className="h-4 w-4" aria-hidden="true" /> {busy ? "Saving…" : "Give consent and link account"}</button>
        <p className="text-xs text-navy-400">We record the consent version, date and time, your account, IP address and browser. You can withdraw consent at any time from your dashboard.</p>
      </form>
    </AuthCard>
  );
}
