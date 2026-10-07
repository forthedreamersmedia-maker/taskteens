"use client";
import { CheckCircle2, Circle } from "lucide-react";
import { isDemoMode } from "@/lib/config";
import { must, useSafetyQuery } from "@/lib/safety/client";
import { INDICATOR_LABELS, type TrustIndicators } from "@/lib/safety/verification";
import type { VerificationStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Separate, truthful verification indicators (spec §5). Never a single "verified" claim. */
export function EmployerIndicators({ employerId, verificationStatus, className }: { employerId: string; verificationStatus: VerificationStatus; className?: string }) {
  const q = useSafetyQuery(async (sb) => (must(await sb.rpc("employer_trust_indicators", { p_employers: [employerId] })) as TrustIndicators[])[0] ?? null, [employerId]);
  const ind: Partial<TrustIndicators> | null = isDemoMode ? { email_confirmed: true, manually_reviewed: verificationStatus === "verified" } : q.data;
  if (!ind) return null;
  return (
    <div className={cn("rounded-2xl border border-navy-100 bg-white p-4", className)}>
      <p className="text-xs font-semibold uppercase tracking-wide text-navy-400">Employer checks</p>
      <ul className="mt-2 grid gap-1.5 text-sm sm:grid-cols-2">
        {INDICATOR_LABELS.map(({ key, label }) => {
          const on = !!ind[key];
          return (
            <li key={key} className={cn("flex items-center gap-1.5", on ? "text-navy-800" : "text-navy-400")}>
              {on ? <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" /> : <Circle className="h-4 w-4" aria-hidden="true" />}
              {label}<span className="sr-only">{on ? ": yes" : ": not yet"}</span>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs text-navy-500">These show which steps were completed. TaskTeens does not run background checks. A parent or guardian approves every job before it&apos;s confirmed.</p>
    </div>
  );
}
