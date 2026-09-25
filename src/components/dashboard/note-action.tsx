"use client";
import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { errorMessage } from "@/lib/utils";

export interface PendingAction { title: string; description?: string; confirmLabel: string; danger?: boolean; requireNote?: boolean; run: (note: string) => Promise<void> }

/** Confirmation dialog that captures a moderation note (recorded in the audit log). */
export function NoteActionModal({ action, onClose, onDone }: { action: PendingAction | null; onClose: () => void; onDone: () => void }) {
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const close = () => { setNote(""); setErr(null); onClose(); };
  return (
    <Modal open={!!action} onClose={close} title={action?.title ?? ""} description={action?.description} size="sm">
      <Field label="Moderation note" optional={!action?.requireNote} required={action?.requireNote} hint="Saved to the audit log. Shared with the employer for listing decisions.">
        <textarea className="input min-h-[80px]" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
      </Field>
      {err && <Alert tone="error" className="mt-3">{err}</Alert>}
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" className="btn-outline" onClick={close}>Cancel</button>
        <button
          type="button"
          disabled={busy}
          className={action?.danger ? "btn-coral" : "btn-primary"}
          onClick={async () => {
            if (action?.requireNote && note.trim().length < 3) return setErr("Please add a short note explaining this action.");
            setBusy(true);
            try {
              await action!.run(note.trim());
              setNote("");
              setErr(null);
              onDone();
            } catch (e) {
              setErr(errorMessage(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Working…" : action?.confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
