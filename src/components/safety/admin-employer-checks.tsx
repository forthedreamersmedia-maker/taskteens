"use client";
import { CheckCircle2, Circle, Mail, MapPin, Phone } from "lucide-react";
import { useState } from "react";
import { NoteActionModal, type PendingAction } from "@/components/dashboard/note-action";
import { Badge } from "@/components/ui/badge";
import { Alert, ErrorState, Skeleton } from "@/components/ui/feedback";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { must, safetySupabase, useSafetyQuery } from "@/lib/safety/client";
import { ADDRESS_STATUS_LABEL, type AddressStatus } from "@/lib/safety/verification";
import { formatDate } from "@/lib/utils";

interface Row {
  employer_id: string; display_name: string; legal_name: string | null; employer_type: string; city: string; verification_status: string;
  email_confirmed: boolean; phone_last4: string | null; phone_confirmed: boolean; restricted: boolean;
  addresses: { id: string; city: string; postal_code: string; status: AddressStatus; standardized: boolean; deliverable: boolean; created_at: string }[];
}
type Shown = { title: string; lines: string[] };

function Check({ on, label }: { on: boolean; label: string }) {
  return <span className={on ? "inline-flex items-center gap-1 text-emerald-700" : "inline-flex items-center gap-1 text-navy-400"}>{on ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : <Circle className="h-4 w-4" aria-hidden="true" />}{label}</span>;
}

/** Admin view of every employer's verification steps. Street addresses are shown only on request, with a logged reason. */
export function AdminEmployerChecks() {
  const toast = useToast();
  const q = useSafetyQuery(async (sb) => must(await sb.rpc("admin_employer_overview")) as Row[], []);
  const [action, setAction] = useState<PendingAction | null>(null);
  const [shown, setShown] = useState<Shown | null>(null);
  const sb = safetySupabase();
  if (!sb) return <Alert tone="info">Employer verification checks require the live backend.</Alert>;
  if (q.loading && !q.data) return <Skeleton className="h-40" />;
  if (q.error) return <ErrorState message={q.error} onRetry={q.reload} />;

  const rpc = async (fn: string, args: Record<string, unknown>) => { const { data, error } = await sb.rpc(fn, args); if (error) throw new Error(error.message); return data; };

  return (
    <section aria-labelledby="emp-checks" className="mb-8">
      <h2 id="emp-checks" className="mb-3 text-lg font-bold">Employer verification steps</h2>
      <ul className="space-y-3">
        {q.data!.map((r) => (
          <li key={r.employer_id} className="card p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-bold">{r.display_name}{r.legal_name && r.legal_name !== r.display_name ? <span className="font-normal text-navy-500"> · legal name {r.legal_name}</span> : null}</p>
                <p className="text-xs capitalize text-navy-500">{r.employer_type} · {r.city}</p>
              </div>
              <div className="flex gap-1.5">{r.restricted && <Badge tone="coral">Restricted</Badge>}<Badge tone={r.verification_status === "verified" ? "green" : r.verification_status === "pending" ? "amber" : "gray"}>{r.verification_status === "verified" ? "Manually reviewed" : r.verification_status}</Badge></div>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <Check on={r.email_confirmed} label="Email" />
              <Check on={r.phone_confirmed} label={`Phone${r.phone_last4 ? ` ··${r.phone_last4}` : ""}`} />
              <Check on={r.addresses.some((a) => a.status === "reviewed" || a.status === "possession_confirmed")} label="Address reviewed" />
              <Check on={r.addresses.some((a) => a.status === "possession_confirmed")} label="Possession" />
            </div>
            {r.phone_last4 && !r.phone_confirmed && (
              <button type="button" className="btn-outline btn-sm mt-3" onClick={() => setAction({ title: `Confirm phone ··${r.phone_last4} manually?`, description: "Only after you called this number and the employer answered. Describe the call.", confirmLabel: "Confirm phone", requireNote: true, run: async (n) => { await rpc("admin_confirm_phone", { p_user: r.employer_id, p_method: "admin_phone_call", p_note: n }); } })}>
                <Phone className="h-4 w-4" aria-hidden="true" /> Confirmed by phone call
              </button>
            )}
            {r.addresses.map((a) => (
              <div key={a.id} className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-cream-50 px-3 py-2 text-sm">
                <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4 text-navy-400" aria-hidden="true" /> {a.city} {a.postal_code} · {ADDRESS_STATUS_LABEL[a.status]} · {a.standardized ? (a.deliverable ? "standardized ✓" : "provider could not confirm") : "not standardized"} · {formatDate(a.created_at)}</span>
                <span className="flex flex-wrap gap-1.5">
                  <button type="button" className="btn-ghost btn-sm" onClick={() => setAction({ title: "View street address", description: "Access is audit-logged. Give the reason.", confirmLabel: "View", requireNote: true, run: async (n) => { const rows = (await rpc("admin_get_address", { p_address: a.id, p_reason: n })) as { line1: string; line2: string | null; city: string; state: string; postal_code: string }[]; const x = rows[0]!; setShown({ title: r.display_name, lines: [x.line1, x.line2 ?? "", `${x.city}, ${x.state} ${x.postal_code}`].filter(Boolean) }); } })}>View</button>
                  {!["reviewed", "possession_confirmed"].includes(a.status) && (
                    <button type="button" className="btn-primary btn-sm" onClick={() => setAction({ title: "Mark address reviewed?", description: "Confirm it's a real residential/business address in the pilot area that matches the employer (e.g. county records, map, call).", confirmLabel: "Mark reviewed", requireNote: true, run: async (n) => { await rpc("admin_set_address_status", { p_address: a.id, p_status: "reviewed", p_note: n }); } })}>Mark reviewed</button>
                  )}
                  {a.status !== "rejected" && <button type="button" className="btn-danger btn-sm" onClick={() => setAction({ title: "Reject address?", confirmLabel: "Reject", danger: true, requireNote: true, run: async (n) => { await rpc("admin_set_address_status", { p_address: a.id, p_status: "rejected", p_note: n }); } })}>Reject</button>}
                  {a.status === "reviewed" && (
                    <button type="button" className="btn-outline btn-sm" onClick={async () => {
                      const res = await fetch("/api/admin/address-code", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address_id: a.id }) });
                      const j = await res.json();
                      if (!res.ok) return toast({ tone: "error", title: "Couldn't create code", body: j.error });
                      setShown({ title: `Mail this code to ${r.display_name}`, lines: [`Code: ${j.code} (valid ${j.expiresInDays} days, shown once)`, "", j.mailTo.line1, j.mailTo.line2 ?? "", `${j.mailTo.city}, ${j.mailTo.state} ${j.mailTo.postal_code}`].filter((x: string, i: number) => x || i === 1) });
                    }}><Mail className="h-4 w-4" aria-hidden="true" /> Mail possession code</button>
                  )}
                </span>
              </div>
            ))}
          </li>
        ))}
      </ul>
      <NoteActionModal action={action} onClose={() => setAction(null)} onDone={() => { setAction(null); toast({ tone: "success", title: "Recorded in the audit log" }); q.reload(); }} />
      <Modal open={!!shown} onClose={() => setShown(null)} title={shown?.title ?? ""} size="sm">
        <pre className="whitespace-pre-wrap rounded-xl bg-cream-50 p-3 font-mono text-sm">{shown?.lines.join("\n")}</pre>
        <p className="mt-2 text-xs text-navy-500">Don&apos;t copy this into email or chat. Close when done.</p>
        <div className="mt-3 flex justify-end"><button type="button" className="btn-primary" onClick={() => setShown(null)}>Done</button></div>
      </Modal>
    </section>
  );
}
