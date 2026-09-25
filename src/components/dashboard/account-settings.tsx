"use client";
import { KeyRound, LogOut, ShieldCheck, UserX } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/lib/auth-context";
import { useAsync } from "@/lib/hooks/use-async";
import { errorMessage } from "@/lib/utils";

export function AccountSettings({ showEmailPrefs = false, privacyNotes }: { showEmailPrefs?: boolean; privacyNotes: string[] }) {
  const { data, session, refresh } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const [name, setName] = useState(session?.user.full_name ?? "");
  const [phone, setPhone] = useState(session?.user.phone ?? "");
  const [busy, setBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteSent, setDeleteSent] = useState(false);
  const { data: blocked = [], reload: reloadBlocked } = useAsync(() => data.listBlockedUserIds(), []);
  const { data: profile, reload: reloadProfile } = useAsync(async () => (showEmailPrefs ? data.getTeenProfile() : null), [showEmailPrefs]);
  useEffect(() => {
    setName(session?.user.full_name ?? "");
    setPhone(session?.user.phone ?? "");
  }, [session]);

  const saveAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) return toast({ tone: "error", title: "Enter your name" });
    if (phone && !/^[+()\-.\s\d]{10,20}$/.test(phone)) return toast({ tone: "error", title: "Enter a valid phone number" });
    setBusy(true);
    try {
      await data.updateAccount({ full_name: name, phone: phone || null });
      await refresh();
      toast({ tone: "success", title: "Account updated" });
    } catch (err) {
      toast({ tone: "error", title: "Couldn't save", body: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <form onSubmit={saveAccount} noValidate className="card grid gap-5 p-5 sm:grid-cols-2 sm:p-6">
        <h2 className="text-lg font-bold sm:col-span-2">Account</h2>
        <Field label="Name" required><input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></Field>
        <Field label="Phone" optional hint="Private. Never shown on listings."><input type="tel" className="input" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" /></Field>
        <Field label="Email" hint="Contact support to change your sign-in email."><input className="input" value={session?.user.email ?? ""} disabled /></Field>
        <div className="flex items-end justify-end"><button type="submit" disabled={busy} className="btn-primary">{busy ? "Saving…" : "Save changes"}</button></div>
      </form>

      <section className="card p-5 sm:p-6" aria-labelledby="privacy-h">
        <h2 id="privacy-h" className="flex items-center gap-2 text-lg font-bold"><ShieldCheck className="h-5 w-5 text-emerald-600" aria-hidden="true" /> Privacy</h2>
        <ul className="mt-3 space-y-1.5 text-sm text-navy-600">{privacyNotes.map((n) => <li key={n}>• {n}</li>)}</ul>
        {showEmailPrefs && profile && (
          <label className="mt-4 flex items-center gap-3 rounded-2xl bg-cream-100 p-3 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 accent-bay-500"
              checked={profile.email_notifications}
              onChange={async (e) => {
                await data.updateTeenProfile({ email_notifications: e.target.checked });
                reloadProfile(true);
                toast({ tone: "success", title: "Email preference saved" });
              }}
            />
            Email me when an employer updates my application (in-app notifications always stay on)
          </label>
        )}
      </section>

      <section className="card p-5 sm:p-6" aria-labelledby="blocked-h">
        <h2 id="blocked-h" className="text-lg font-bold">Blocked accounts</h2>
        {blocked.length === 0 ? (
          <p className="mt-2 text-sm text-navy-500">You haven&apos;t blocked anyone. You can block an employer from any listing, or an applicant from their application.</p>
        ) : (
          <ul className="mt-3 divide-y divide-navy-50">
            {blocked.map((id) => (
              <li key={id} className="flex items-center justify-between py-2 text-sm">
                <span className="font-mono text-xs text-navy-500">{id}</span>
                <button type="button" className="btn-ghost btn-sm" onClick={async () => { await data.unblockUser(id); reloadBlocked(true); }}>Unblock</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card flex flex-wrap gap-3 p-5 sm:p-6" aria-label="Security">
        <Link href="/auth/reset-password" className="btn-outline"><KeyRound className="h-4 w-4" aria-hidden="true" /> Change password</Link>
        <button type="button" className="btn-outline" onClick={async () => { await data.signOut(); router.push("/"); }}><LogOut className="h-4 w-4" aria-hidden="true" /> Sign out</button>
        <button type="button" className="btn-danger" onClick={() => setDeleteOpen(true)}><UserX className="h-4 w-4" aria-hidden="true" /> Request account deletion</button>
      </section>

      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Request account deletion" size="sm">
        {deleteSent ? (
          <Alert tone="success" title="Request received">An administrator will process your deletion request and confirm by email.</Alert>
        ) : (
          <>
            <p className="text-sm text-navy-600">We&apos;ll delete your profile, résumé and applications. Some records (like safety reports and audit logs) may be kept as required.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="btn-outline" onClick={() => setDeleteOpen(false)}>Cancel</button>
              <button type="button" className="btn-coral" onClick={async () => { await data.deleteAccountRequest(); setDeleteSent(true); }}>Send request</button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
