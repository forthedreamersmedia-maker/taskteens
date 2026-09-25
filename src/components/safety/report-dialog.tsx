"use client";
import { Flag } from "lucide-react";
import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/lib/auth-context";
import { REPORT_REASONS } from "@/lib/constants";
import { REVIEW_DISPUTE_REASONS } from "@/lib/ratings";
import type { ReportTarget } from "@/lib/types";
import { fieldErrors, reportSchema } from "@/lib/validation";
import { errorMessage } from "@/lib/utils";

export function ReportForm({ targetType, targetId, onDone, defaultSeverity = "normal" }: { targetType: ReportTarget; targetId: string | null; onDone?: () => void; defaultSeverity?: "normal" | "urgent" | "emergency" }) {
  const { data, session } = useAuth();
  const toast = useToast();
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [severity, setSeverity] = useState<"normal" | "urgent" | "emergency">(defaultSeverity);
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const input = { target_type: targetType, target_id: targetId, reason, details, severity, contact_email: session ? session.user.email : email || null };
    const parsed = reportSchema.safeParse(input);
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setBusy(true);
    try {
      await data.createReport({ ...parsed.data, contact_email: parsed.data.contact_email || null });
      setDone(true);
      toast({ tone: "success", title: "Report received", body: "Thank you. Our moderation team will review it." });
      onDone?.();
    } catch (err) {
      setErrors({ _form: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  if (done)
    return (
      <Alert tone="success" title="Thanks — your report was submitted.">
        {severity === "emergency" ? "It has been flagged as an emergency for moderators. If anyone is in immediate danger, call 911 now." : "A moderator will review it. You can file another report at any time."}
      </Alert>
    );

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <Alert tone="warn">If someone is in immediate danger, <strong>call 911</strong> first.</Alert>
      <Field label="What's the issue?" required error={errors.reason}>
        <select className="input" value={reason} onChange={(e) => setReason(e.target.value)}>
          <option value="">Choose a reason</option>
          {(targetType === "review" ? REVIEW_DISPUTE_REASONS : REPORT_REASONS).map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
      </Field>
      <Field label="What happened?" required error={errors.details} hint="Include dates, what was said or asked, and anything else that helps.">
        <textarea className="input min-h-[120px]" value={details} onChange={(e) => setDetails(e.target.value)} maxLength={4000} />
      </Field>
      <fieldset>
        <legend className="label">How urgent is this?</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {([
            ["normal", "Normal", "Review soon"],
            ["urgent", "Urgent", "Needs quick attention"],
            ["emergency", "Emergency", "Safety risk right now"],
          ] as const).map(([v, l, d]) => (
            <label key={v} className={`flex cursor-pointer flex-col rounded-2xl border p-3 text-sm ${severity === v ? "border-coral-400 bg-coral-50" : "border-navy-200 bg-white"}`}>
              <span className="flex items-center gap-2 font-semibold">
                <input type="radio" name="severity" value={v} checked={severity === v} onChange={() => setSeverity(v)} className="accent-coral-500" />
                {l}
              </span>
              <span className="ml-5 text-xs text-navy-500">{d}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {!session && (
        <Field label="Your email (so we can follow up)" optional error={errors.contact_email}>
          <input type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </Field>
      )}
      {errors._form && <Alert tone="error">{errors._form}</Alert>}
      <button type="submit" disabled={busy} className="btn-coral w-full">
        {busy ? "Sending…" : "Submit report"}
      </button>
    </form>
  );
}

export function ReportButton({ targetType, targetId, label = "Report", className }: { targetType: ReportTarget; targetId: string | null; label?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className ?? "btn-ghost btn-sm text-navy-500"}>
        <Flag className="h-3.5 w-3.5" aria-hidden="true" /> {label}
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={targetType === "review" ? "Dispute this rating" : "Report a concern"}
        description={targetType === "review" ? "A TaskTeens moderator will review the rating. It stays visible unless a moderator hides it." : "Reports go to TaskTeens moderators. The person you report is not told who reported them."}
      >
        <ReportForm targetType={targetType} targetId={targetId} />
      </Modal>
    </>
  );
}
