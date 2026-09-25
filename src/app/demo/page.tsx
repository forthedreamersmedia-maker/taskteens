"use client";
import { FlaskConical, Mail, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { dashboardPathFor, useAuth } from "@/lib/auth-context";
import { isDemoMode } from "@/lib/config";
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "@/lib/data/seed";
import { useAsync } from "@/lib/hooks/use-async";
import { formatDateTime } from "@/lib/utils";
import type { EmailLogEntry } from "@/lib/types";

export default function DemoPage() {
  const { data, refresh } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const { data: outbox = [], reload } = useAsync(async () => (data.demoOutbox ? data.demoOutbox() : []), []);
  const [open, setOpen] = useState<EmailLogEntry | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  if (!isDemoMode)
    return (
      <div className="container-page max-w-2xl py-16">
        <Alert tone="info" title="Demo tools are disabled">This deployment is connected to Supabase, so real accounts and email delivery are in use.</Alert>
      </div>
    );

  const signInAs = async (email: string) => {
    await data.signIn(email, DEMO_PASSWORD);
    await refresh();
    const s = await data.getSession();
    router.push(dashboardPathFor(s?.user.role));
  };

  return (
    <div className="container-page py-12">
      <p className="eyebrow flex items-center gap-1.5"><FlaskConical className="h-4 w-4" aria-hidden="true" /> Local demonstration mode</p>
      <h1 className="mt-2 text-3xl font-bold">Demo accounts &amp; email outbox</h1>
      <p className="mt-2 max-w-2xl text-navy-500">Everything here lives in this browser&apos;s local storage. Open a teen account in one window and the employer account in another (e.g. a private window won&apos;t share data — use two tabs) to watch an application arrive in real time.</p>

      <section className="mt-8 grid gap-4 md:grid-cols-3" aria-label="Demo accounts">
        {DEMO_ACCOUNTS.map((a) => (
          <div key={a.email} className="card p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-navy-400">{a.role}</p>
            <p className="mt-1 font-semibold">{a.label}</p>
            <p className="mt-1 font-mono text-xs text-navy-500">{a.email}</p>
            <p className="font-mono text-xs text-navy-500">password: {DEMO_PASSWORD}</p>
            <button type="button" onClick={() => signInAs(a.email)} className="btn-primary btn-sm mt-4">Sign in as {a.role}</button>
          </div>
        ))}
      </section>

      <section className="mt-10" aria-labelledby="walkthrough">
        <h2 id="walkthrough" className="text-xl font-bold">Suggested walkthrough</h2>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-navy-600">
          <li>Sign in as <strong>Maya (teen)</strong> and apply to “After-school dog walker” by Solano Paws.</li>
          <li>Check the outbox below — an employer notification and a teen confirmation were “sent”.</li>
          <li>Sign in as <strong>Solano Paws (employer)</strong>: the application is already in the dashboard. Request an interview or select her.</li>
          <li>Sign back in as Maya — the status changed and a notification appeared.</li>
          <li>Sign in as <strong>admin</strong> to approve the pending listing, review verifications and see the audit log.</li>
        </ol>
      </section>

      <section className="mt-10" aria-labelledby="outbox">
        <div className="flex items-center justify-between">
          <h2 id="outbox" className="text-xl font-bold">Email outbox ({outbox.length})</h2>
          <div className="flex gap-2">
            <button type="button" className="btn-outline btn-sm" onClick={() => reload()}>Refresh</button>
            <button type="button" className="btn-danger btn-sm" onClick={() => setConfirmReset(true)}><RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Reset demo data</button>
          </div>
        </div>
        <div className="mt-4">
          {outbox.length === 0 ? (
            <EmptyState icon={Mail} title="No emails yet" body="Submit an application or change a status to see transactional emails appear here." />
          ) : (
            <ul className="divide-y divide-navy-100 overflow-hidden rounded-3xl border border-navy-100 bg-white">
              {outbox.map((m) => (
                <li key={m.id}>
                  <button type="button" onClick={() => setOpen(m)} className="flex w-full flex-col gap-0.5 px-5 py-3 text-left hover:bg-cream-100 sm:flex-row sm:items-center sm:justify-between">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{m.subject}</span>
                      <span className="block truncate text-xs text-navy-500">To: {m.to}</span>
                    </span>
                    <span className="shrink-0 text-xs text-navy-400">{formatDateTime(m.created_at)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <Modal open={!!open} onClose={() => setOpen(null)} title={open?.subject ?? ""} description={open ? `To: ${open.to}` : undefined} size="lg">
        <pre className="whitespace-pre-wrap rounded-2xl bg-cream-100 p-4 font-sans text-sm leading-6 text-navy-700">{open?.text}</pre>
      </Modal>
      <Modal open={confirmReset} onClose={() => setConfirmReset(false)} title="Reset demo data?" description="This restores the original demo listings and accounts in this browser and signs you out." size="sm">
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-outline" onClick={() => setConfirmReset(false)}>Cancel</button>
          <button
            type="button"
            className="btn-coral"
            onClick={async () => {
              await data.demoReset?.();
              await data.signOut();
              await refresh();
              setConfirmReset(false);
              reload();
              toast({ tone: "success", title: "Demo data reset" });
            }}
          >
            Reset
          </button>
        </div>
      </Modal>
    </div>
  );
}
