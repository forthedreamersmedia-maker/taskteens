"use client";
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/dashboard/admin-shell";
import { Field } from "@/components/ui/field";
import { Alert, PageLoader } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { useData } from "@/lib/auth-context";
import { useAsync } from "@/lib/hooks/use-async";
import type { PlatformSettings } from "@/lib/types";
import { errorMessage } from "@/lib/utils";

export default function PlatformRulesPage() {
  const data = useData();
  const toast = useToast();
  const { data: settings, loading } = useAsync(() => data.getSettings(), []);
  const [s, setS] = useState<PlatformSettings | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setS(settings ?? null), [settings]);
  if (loading || !s) return <AdminShell title="Platform rules"><PageLoader /></AdminShell>;
  const num = (k: keyof PlatformSettings) => (e: React.ChangeEvent<HTMLInputElement>) => setS({ ...s, [k]: Number(e.target.value) });
  return (
    <AdminShell title="Platform rules" subtitle="Configurable age, consent, permit and moderation rules.">
      <Alert tone="warn" className="mb-5" title="These are product settings, not legal determinations">Confirm every value with qualified counsel before launch. TaskTeens displays them as guidance and never claims to verify permits or consent.</Alert>
      <form
        className="card space-y-5 p-5 sm:p-6"
        onSubmit={async (e) => {
          e.preventDefault();
          if (s.min_worker_age < 13 || s.min_worker_age > 18) return toast({ tone: "error", title: "Minimum age must be between 13 and 18" });
          setBusy(true);
          try {
            await data.adminUpdateSettings(s);
            toast({ tone: "success", title: "Rules saved", body: "Recorded in the audit log." });
          } catch (err) {
            toast({ tone: "error", title: "Couldn't save", body: errorMessage(err) });
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="grid gap-5 sm:grid-cols-3">
          <Field label="Minimum worker age" hint="Lowest age a listing may accept."><input type="number" className="input" value={s.min_worker_age} onChange={num("min_worker_age")} min={13} max={18} /></Field>
          <Field label="Require guardian consent under age" hint="Applicants below this age must report consent status."><input type="number" className="input" value={s.guardian_consent_under_age} onChange={num("guardian_consent_under_age")} min={13} max={21} /></Field>
          <Field label="Show work-permit guidance under age"><input type="number" className="input" value={s.work_permit_reminder_under_age} onChange={num("work_permit_reminder_under_age")} min={13} max={21} /></Field>
        </div>
        <label className="flex items-center gap-3 rounded-2xl bg-cream-100 p-4 text-sm">
          <input type="checkbox" className="h-4 w-4 accent-bay-500" checked={s.require_job_approval} onChange={(e) => setS({ ...s, require_job_approval: e.target.checked })} />
          <span><strong>Require admin approval</strong> before new listings are publicly visible</span>
        </label>
        <Field label="Rules note shown on applications" hint="Plain-language guidance about permits and consent.">
          <textarea className="input min-h-[110px]" value={s.rules_note} onChange={(e) => setS({ ...s, rules_note: e.target.value })} maxLength={1500} />
        </Field>
        <div className="flex justify-end"><button type="submit" disabled={busy} className="btn-primary">{busy ? "Saving…" : "Save rules"}</button></div>
      </form>
    </AdminShell>
  );
}
