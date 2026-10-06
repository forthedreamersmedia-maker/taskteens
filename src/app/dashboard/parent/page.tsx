"use client";
import { MapPin, PauseCircle, PlayCircle, ShieldOff, UserRound } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ParentShell } from "@/components/dashboard/parent-shell";
import { NotificationList } from "@/components/dashboard/notification-list";
import { Section } from "@/components/layout/dashboard-shell";
import { RequiresBackend } from "@/components/safety/demo-notice";
import { Field } from "@/components/ui/field";
import { Alert, EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { isDemoMode } from "@/lib/config";
import { must, safetySupabase, useSafetyQuery } from "@/lib/safety/client";
import { kickNotifications } from "@/lib/safety/kick";
import { LOCATION_CONSENT_TEXT, PARENT_STATUS_LABEL } from "@/lib/safety/consent";
import { loadMyTeens, loadTeenApplications, type LinkedTeen } from "@/lib/safety/parent";
import { formatDate } from "@/lib/utils";

export default function ParentOverview() {
  const toast = useToast();
  const q = useSafetyQuery(async (sb) => ({ teens: await loadMyTeens(sb), apps: await loadTeenApplications(sb) }), []);
  const [revoking, setRevoking] = useState<LinkedTeen | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  if (isDemoMode) return <ParentShell title="Parent dashboard"><RequiresBackend feature="The parent dashboard" /></ParentShell>;

  const act = async (label: string, fn: () => PromiseLike<{ data: unknown; error: { message: string } | null }>) => {
    setBusy(true);
    try {
      must(await fn());
      kickNotifications();
      toast({ tone: "success", title: label });
      await q.reload();
    } catch (e) {
      toast({ tone: "error", title: "That didn't work", body: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };
  const sb = safetySupabase()!;

  return (
    <ParentShell title="Parent dashboard" subtitle="You approve every job before it's confirmed and can read all of your teen's TaskTeens messages.">
      {q.loading && !q.data ? (
        <div className="space-y-3"><Skeleton className="h-32" /><Skeleton className="h-24" /></div>
      ) : q.error ? (
        <ErrorState message={q.error} onRetry={q.reload} />
      ) : !q.data!.teens.length ? (
        <EmptyState icon={UserRound} title="No teen linked yet" body="Open the invitation link your teen emailed you to link their account. If it expired, ask them to send a new one from their dashboard." />
      ) : (
        <div className="space-y-4">
          {q.data!.teens.map((t) => {
            const apps = q.data!.apps.filter((a) => a.teen_id === t.teen_id);
            const awaiting = apps.filter((a) => a.status === "selected").length;
            return (
              <section key={t.teen_id} className="card space-y-4 p-5" aria-label={t.full_name}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold">{t.full_name}</h2>
                    <p className="text-sm text-navy-500">{[t.age_range && `Age ${t.age_range}`, t.city].filter(Boolean).join(" · ")}</p>
                  </div>
                  <span className="rounded-full bg-navy-50 px-3 py-1 text-xs font-semibold text-navy-700">{t.status === "confirmed" ? "Parent confirmed" : t.status === "paused" ? "Paused" : PARENT_STATUS_LABEL[t.status]}</span>
                </div>
                {awaiting > 0 && (
                  <Alert tone="warn" title={`${awaiting} job${awaiting > 1 ? "s" : ""} waiting for your approval`}>
                    <Link href="/dashboard/parent/applications" className="link">Review and approve or decline</Link>
                  </Alert>
                )}
                <dl className="grid gap-3 text-sm sm:grid-cols-3">
                  <div><dt className="text-xs text-navy-400">Active applications</dt><dd className="font-semibold">{apps.filter((a) => !["withdrawn", "not_selected", "parent_declined", "cancelled"].includes(a.status) && !a.completed_at).length}</dd></div>
                  <div><dt className="text-xs text-navy-400">Confirmed jobs</dt><dd className="font-semibold">{apps.filter((a) => a.status === "confirmed" && !a.completed_at).length}</dd></div>
                  <div><dt className="text-xs text-navy-400">Consent given</dt><dd className="font-semibold">{t.consent_at ? `${formatDate(t.consent_at)} (${t.consent_version})` : "—"}</dd></div>
                </dl>
                <div className="flex flex-wrap gap-2 border-t border-navy-50 pt-4">
                  {t.status === "confirmed" || t.status === "paused" ? (
                    t.paused ? (
                      <button type="button" disabled={busy} className="btn-outline btn-sm" onClick={() => act("Account resumed", () => sb.rpc("parent_set_pause", { p_teen: t.teen_id, p_paused: false }))}><PlayCircle className="h-4 w-4" aria-hidden="true" /> Resume account</button>
                    ) : (
                      <button type="button" disabled={busy} className="btn-outline btn-sm" onClick={() => act("Account paused — no new applications", () => sb.rpc("parent_set_pause", { p_teen: t.teen_id, p_paused: true }))}><PauseCircle className="h-4 w-4" aria-hidden="true" /> Pause account</button>
                    )
                  ) : null}
                  {t.status !== "revoked" && t.status !== "none" && (
                    <button type="button" disabled={busy} className="btn-danger btn-sm" onClick={() => { setRevoking(t); setReason(""); }}><ShieldOff className="h-4 w-4" aria-hidden="true" /> Withdraw consent</button>
                  )}
                </div>
                {t.status !== "revoked" && (
                  <label className="flex items-start gap-2.5 rounded-2xl bg-cream-50 p-3 text-sm">
                    <input type="checkbox" className="mt-0.5 h-4 w-4 accent-bay-500" disabled={busy} checked={t.location_sharing_allowed}
                      onChange={(e) => act(e.target.checked ? "Location sharing allowed" : "Location sharing turned off", () => sb.rpc("parent_set_location_permission", { p_teen: t.teen_id, p_allowed: e.target.checked }))} />
                    <span><MapPin className="mr-1 inline h-4 w-4 text-navy-400" aria-hidden="true" />{LOCATION_CONSENT_TEXT}</span>
                  </label>
                )}
              </section>
            );
          })}
        </div>
      )}

      <Section title="Recent notifications" action={<Link href="/dashboard/parent/notifications" className="link text-sm">See all</Link>}>
        <NotificationList limit={5} />
      </Section>

      <Modal open={!!revoking} onClose={() => setRevoking(null)} title="Withdraw consent?" description="Your teen won't be able to apply to jobs. Open applications and confirmed jobs that haven't been completed are cancelled, and location sharing stops.">
        <Field label="Reason" optional hint="Kept in TaskTeens' records.">
          <textarea className="input min-h-[70px]" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={() => setRevoking(null)}>Keep consent</button>
          <button type="button" disabled={busy} className="btn-danger" onClick={async () => { const t = revoking!; setRevoking(null); await act("Consent withdrawn", () => sb.rpc("parent_revoke_consent", { p_teen: t.teen_id, p_reason: reason })); }}>Withdraw consent</button>
        </div>
      </Modal>
    </ParentShell>
  );
}
