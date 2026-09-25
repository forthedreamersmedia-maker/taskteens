import { BadgeCheck, FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";
import { APPLICATION_STATUS_LABEL, APPLICATION_STATUS_TONE } from "@/lib/constants";
import type { ApplicationStatus, VerificationStatus } from "@/lib/types";

const TONES = {
  blue: "bg-bay-50 text-bay-700 ring-bay-200",
  navy: "bg-navy-50 text-navy-700 ring-navy-200",
  coral: "bg-coral-50 text-coral-700 ring-coral-200",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  gray: "bg-slate-100 text-slate-600 ring-slate-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  cream: "bg-cream-200 text-navy-700 ring-cream-300",
} as const;
export type Tone = keyof typeof TONES;

export function Badge({ tone = "navy", className, children }: { tone?: Tone; className?: string; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset", TONES[tone], className)}>
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: ApplicationStatus }) {
  return <Badge tone={APPLICATION_STATUS_TONE[status]}>{APPLICATION_STATUS_LABEL[status]}</Badge>;
}

/** Only renders when the database marks the employer as verified. Wording avoids implying a background check. */
export function VerifiedBadge({ status, className }: { status: VerificationStatus; className?: string }) {
  if (status !== "verified") return null;
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-full bg-bay-50 px-2 py-0.5 text-xs font-semibold text-bay-700 ring-1 ring-inset ring-bay-200", className)}
      title="Profile reviewed by a TaskTeens administrator. This is not a background check."
    >
      <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
      Verified profile
    </span>
  );
}

export function DemoBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-800", className)}
      title="Demonstration content — this listing and employer are fictional."
    >
      <FlaskConical className="h-3 w-3" aria-hidden="true" />
      Demo listing
    </span>
  );
}
