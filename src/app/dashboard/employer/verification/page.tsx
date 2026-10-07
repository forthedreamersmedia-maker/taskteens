"use client";
import { CheckCircle2, Circle, Clock, MapPin, Phone, XCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { EmployerShell } from "@/components/dashboard/employer-shell";
import { RequiresBackend } from "@/components/safety/demo-notice";
import { Field } from "@/components/ui/field";
import { Alert, ErrorState, Skeleton } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { isDemoMode } from "@/lib/config";
import { CITIES } from "@/lib/constants";
import { must, useSafetyQuery } from "@/lib/safety/client";
import { ADDRESS_STATUS_LABEL, type AddressStatus } from "@/lib/safety/verification";
import { cn } from "@/lib/utils";

interface Mine { email_confirmed: boolean; phone_last4: string | null; phone_confirmed: boolean; legal_name: string | null; verification_status: string; ready_to_post: boolean; restricted: boolean }
interface Addr { id: string; line1: string; line2: string | null; city: string; postal_code: string; status: AddressStatus; standardized: { deliverable?: boolean } | null }

async function post(url: string, body: unknown) {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error ?? "Something went wrong."), { code: j.code });
  return j;
}

function Step({ done, pending, title, children }: { done: boolean; pending?: boolean; title: string; children?: React.ReactNode }) {
  const Icon = done ? CheckCircle2 : pending ? Clock : Circle;
  return (
    <li className="card p-5">
      <div className="flex items-start gap-3">
        <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", done ? "text-emerald-600" : pending ? "text-amber-500" : "text-navy-300")} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">{title} <span className="sr-only">{done ? "(done)" : pending ? "(in progress)" : "(not done)"}</span></h2>
          {children && <div className="mt-2 space-y-3 text-sm text-navy-600">{children}</div>}
        </div>
      </div>
    </li>
  );
}

export default function EmployerVerification() {
  const toast = useToast();
  const q = useSafetyQuery(async (sb) => ({
    me: (must(await sb.rpc("my_verification")) as Mine[])[0] ?? null,
    addresses: (must(await sb.from("employer_addresses").select("id,line1,line2,city,postal_code,status,standardized").order("created_at")) as Addr[]) ?? [],
  }), []);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [smsDown, setSmsDown] = useState(false);
  const [addr, setAddr] = useState({ line1: "", line2: "", city: "", postal_code: "" });
  const [editing, setEditing] = useState<string | null>(null);
  const [possession, setPossession] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (isDemoMode) return <EmployerShell title="Verification"><RequiresBackend feature="Employer verification" /></EmployerShell>;
  if (q.loading && !q.data) return <EmployerShell title="Verification"><Skeleton className="h-64" /></EmployerShell>;
  if (q.error || !q.data?.me) return <EmployerShell title="Verification"><ErrorState message={q.error ?? "Finish your employer profile first."} onRetry={q.reload} /></EmployerShell>;
  const { me, addresses } = q.data;
  const addrDone = addresses.some((a) => a.status === "reviewed" || a.status === "possession_confirmed");

  const run = async (fn: () => Promise<unknown>, success?: string) => {
    setBusy(true); setErr(null);
    try { await fn(); if (success) toast({ tone: "success", title: success }); await q.reload(); }
    catch (e) { setErr((e as Error).message); if ((e as { code?: string }).code === "sms_unavailable") { setSmsDown(true); await q.reload(); } }
    finally { setBusy(false); }
  };

  return (
    <EmployerShell title="Verification" subtitle="Each step shows separately on your listings. None of them is a background check.">
      {me.ready_to_post ? (
        <Alert tone="success" title="You can publish listings">Every step is complete. Listings still go through moderator review.</Alert>
      ) : (
        <Alert tone="info" title="Complete every step to publish">You can save drafts any time. Publishing unlocks after email, phone, address review and a manual review by TaskTeens.</Alert>
      )}
      {me.restricted && <Alert tone="warn" className="mt-3" title="Your account is temporarily restricted">Listings and messages are paused while TaskTeens reviews your account.</Alert>}
      {err && <Alert tone="error" className="mt-3">{err}</Alert>}

      <ol className="mt-5 space-y-3">
        <Step done={me.email_confirmed} title="Email confirmed">{!me.email_confirmed && <p>Click the link in the confirmation email we sent when you signed up.</p>}</Step>

        <Step done={me.phone_confirmed} pending={!!me.phone_last4 && !me.phone_confirmed} title="Phone confirmed">
          {me.phone_confirmed ? <p>Number ending in {me.phone_last4}. It&apos;s never shown to teens or on listings.</p> : (
            <>
              {me.phone_last4 && <p>Saved number ending in {me.phone_last4} — not confirmed yet.</p>}
              {smsDown && <Alert tone="warn">Text-message codes aren&apos;t available yet. Your number is saved — a TaskTeens administrator will call you to confirm it.</Alert>}
              {!codeSent ? (
                <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); run(async () => { await post("/api/verification/phone", { action: "send", phone }); setCodeSent(true); }, "Code sent"); }}>
                  <Field label="Mobile number" className="min-w-[200px] flex-1"><input type="tel" className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(510) 555-0123" autoComplete="tel" /></Field>
                  <button type="submit" disabled={busy || phone.replace(/\D/g, "").length < 10} className="btn-primary"><Phone className="h-4 w-4" aria-hidden="true" /> Text me a code</button>
                </form>
              ) : (
                <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); run(() => post("/api/verification/phone", { action: "confirm", code }), "Phone confirmed"); }}>
                  <Field label="6-digit code"><input className="input w-36 font-mono tracking-widest" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} autoComplete="one-time-code" /></Field>
                  <button type="submit" disabled={busy || code.length !== 6} className="btn-primary">Confirm</button>
                  <button type="button" className="btn-ghost" onClick={() => setCodeSent(false)}>Use a different number</button>
                </form>
              )}
            </>
          )}
        </Step>

        <Step done={!!me.legal_name} title="Legal name">
          <p>{me.legal_name ? <>On file: <strong>{me.legal_name}</strong>. Kept private; changing it after review means another review.</> : "Add your legal name in your employer profile."}{" "}<Link href="/onboarding/employer?next=/dashboard/employer/verification" className="link">Edit</Link></p>
        </Step>

        <Step done={addrDone} pending={addresses.length > 0 && !addrDone} title="Service address reviewed">
          <p>Where the work happens. It&apos;s private: teens and parents see it only after a parent approves a specific job. Listings show only the city and neighborhood.</p>
          {addresses.map((a) => (
            <div key={a.id} className="rounded-2xl border border-navy-100 bg-white p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="flex items-start gap-1.5"><MapPin className="mt-0.5 h-4 w-4 text-navy-400" aria-hidden="true" />{a.line1}{a.line2 ? `, ${a.line2}` : ""}, {a.city} {a.postal_code}</p>
                <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", a.status === "rejected" ? "bg-coral-50 text-coral-700" : a.status === "reviewed" || a.status === "possession_confirmed" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800")}>{ADDRESS_STATUS_LABEL[a.status]}</span>
              </div>
              {a.status === "reviewed" && (
                <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); run(() => post("/api/verification/address/possession", { address_id: a.id, code: possession[a.id] ?? "" }), "Address possession confirmed"); }}>
                  <Field label="Code from mailed card" optional hint="If TaskTeens mailed you a card, enter its code."><input className="input w-40 font-mono uppercase tracking-widest" maxLength={12} value={possession[a.id] ?? ""} onChange={(e) => setPossession((p) => ({ ...p, [a.id]: e.target.value.toUpperCase() }))} /></Field>
                  <button type="submit" disabled={busy || (possession[a.id] ?? "").length < 6} className="btn-outline btn-sm">Confirm code</button>
                </form>
              )}
              {a.status !== "possession_confirmed" && <button type="button" className="btn-ghost btn-sm mt-2" onClick={() => { setEditing(a.id); setAddr({ line1: a.line1, line2: a.line2 ?? "", city: a.city, postal_code: a.postal_code }); }}>Edit (requires review again)</button>}
            </div>
          ))}
          {(editing !== null || addresses.length === 0) ? (
            <form className="grid gap-3 rounded-2xl bg-cream-50 p-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); run(async () => { const r = await post("/api/verification/address", { ...addr, id: editing || undefined }); setEditing(null); setAddr({ line1: "", line2: "", city: "", postal_code: "" }); if (r.standardization === "not_configured") toast({ tone: "info", title: "Address saved", body: "Automatic standardization isn't configured, so a TaskTeens administrator will review it manually." }); }, "Address saved for review"); }}>
              <Field label="Street address" required className="sm:col-span-2"><input className="input" value={addr.line1} onChange={(e) => setAddr({ ...addr, line1: e.target.value })} autoComplete="address-line1" /></Field>
              <Field label="Apt / unit" optional><input className="input" value={addr.line2} onChange={(e) => setAddr({ ...addr, line2: e.target.value })} autoComplete="address-line2" /></Field>
              <Field label="City" required>
                <select className="input" value={addr.city} onChange={(e) => setAddr({ ...addr, city: e.target.value })}><option value="">Choose…</option>{CITIES.filter((c) => c !== "Remote").map((c) => <option key={c}>{c}</option>)}</select>
              </Field>
              <Field label="ZIP" required><input className="input" inputMode="numeric" maxLength={10} value={addr.postal_code} onChange={(e) => setAddr({ ...addr, postal_code: e.target.value })} autoComplete="postal-code" /></Field>
              <div className="flex items-end gap-2"><button type="submit" disabled={busy} className="btn-primary">Save address</button>{editing !== null && <button type="button" className="btn-ghost" onClick={() => setEditing(null)}>Cancel</button>}</div>
            </form>
          ) : (
            <button type="button" className="btn-outline btn-sm" onClick={() => setEditing("")}>Add another address</button>
          )}
        </Step>

        <Step done={me.verification_status === "verified"} pending={me.verification_status === "pending"} title="Manually reviewed by TaskTeens">
          {me.verification_status === "verified" ? <p>An administrator reviewed your profile. This is not a background check.</p>
            : me.verification_status === "pending" ? <p>Your review request is in the queue.</p>
            : <p>{me.verification_status === "rejected" && <XCircle className="mr-1 inline h-4 w-4 text-coral-600" aria-hidden="true" />}Request a manual review once the other steps are done. <Link href="/onboarding/employer?next=/dashboard/employer/verification" className="link">Request review</Link></p>}
        </Step>
      </ol>
    </EmployerShell>
  );
}
