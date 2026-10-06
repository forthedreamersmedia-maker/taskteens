"use client";
import { CalendarClock, MapPin } from "lucide-react";
import { isDemoMode } from "@/lib/config";
import { must, useSafetyQuery } from "@/lib/safety/client";
import { formatDateTime } from "@/lib/utils";

interface Address { line1: string; line2: string | null; city: string; state: string; postal_code: string }

/** Exact address + scheduled time, released only after parent approval (RLS/RPC enforced). */
export function ConfirmedJobInfo({ applicationId }: { applicationId: string }) {
  const q = useSafetyQuery(async (sb) => ({
    address: ((must(await sb.rpc("get_job_address", { p_application: applicationId })) as Address[]) ?? [])[0] ?? null,
    shifts: ((must(await sb.from("job_shifts").select("starts_at,ends_at,status").eq("application_id", applicationId).neq("status", "cancelled").order("starts_at"))) as { starts_at: string; ends_at: string; status: string }[]) ?? [],
  }), [applicationId]);
  if (isDemoMode) return <p className="text-xs text-navy-500">In the live app, the exact address and time appear here after your parent approves.</p>;
  if (!q.data) return null;
  const { address, shifts } = q.data;
  return (
    <div className="w-full space-y-1 text-sm text-navy-700">
      {address ? (
        <p className="flex items-start gap-1.5"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-navy-400" aria-hidden="true" />
          <a className="link" target="_blank" rel="noopener noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${address.line1}, ${address.city}, ${address.state} ${address.postal_code}`)}`}>
            {address.line1}{address.line2 ? `, ${address.line2}` : ""}, {address.city}
          </a>
        </p>
      ) : <p className="text-navy-500">No address on file for this job (remote, or awaiting re-approval).</p>}
      {shifts.map((s) => <p key={s.starts_at} className="flex items-center gap-1.5"><CalendarClock className="h-4 w-4 text-navy-400" aria-hidden="true" />{formatDateTime(s.starts_at)} – {new Date(s.ends_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" })}</p>)}
    </div>
  );
}
