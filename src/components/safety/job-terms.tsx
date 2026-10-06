import { WORK_SETTING_LABEL, RISK_FLAG_LABEL } from "@/lib/constants";
import { formatDuration, formatTime } from "@/lib/safety/format";
import type { WorkSetting } from "@/lib/types";
import { formatDate } from "@/lib/utils";

export interface JobTerms {
  title: string; description: string; responsibilities: string[]; pay_type: string; pay_min: number; pay_max: number | null;
  start_date: string | null; start_time: string | null; duration_minutes: number | null; schedule: string; work_setting: WorkSetting | null;
  city: string; neighborhood: string | null; supervision: string | null; equipment: string | null; known_risks: string | null; min_age: number;
  version?: number; risk_flags?: string[]; moderation_status?: string; status?: string;
}

export function payText(t: Pick<JobTerms, "pay_type" | "pay_min" | "pay_max">) {
  if (t.pay_type === "unpaid") return "Unpaid (volunteer)";
  const range = t.pay_max ? `$${t.pay_min}–$${t.pay_max}` : `$${t.pay_min}`;
  return t.pay_type === "hourly" ? `${range}/hr` : `${range} ${t.pay_type}`;
}

/** The exact terms a parent approves (spec §6 required fields). */
export function JobTermsList({ t }: { t: JobTerms }) {
  const rows: [string, string | null][] = [
    ["Duties", t.responsibilities?.join(" · ") || null],
    ["Pay", payText(t)],
    ["Date & time", t.start_date ? `${formatDate(t.start_date)}${t.start_time ? ` at ${formatTime(t.start_time)}` : ""}` : t.schedule],
    ["Duration", t.duration_minutes ? formatDuration(t.duration_minutes) : null],
    ["Approximate location", `${t.neighborhood ? `${t.neighborhood}, ` : ""}${t.city}`],
    ["Where", t.work_setting ? WORK_SETTING_LABEL[t.work_setting] : null],
    ["Supervision", t.supervision],
    ["Equipment", t.equipment],
    ["Known risks", t.known_risks],
    ["Minimum age", `${t.min_age}+`],
  ];
  return (
    <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt className="text-xs font-semibold uppercase tracking-wide text-navy-400">{k}</dt>
          <dd className={v ? "text-navy-800" : "text-coral-700"}>{v ?? "Not provided"}</dd>
        </div>
      ))}
      {!!t.risk_flags?.length && (
        <div className="sm:col-span-2">
          <dt className="text-xs font-semibold uppercase tracking-wide text-coral-600">Moderator flags (reviewed by a person)</dt>
          <dd className="text-coral-800">{t.risk_flags.map((f) => RISK_FLAG_LABEL[f] ?? f).join(", ")}</dd>
        </div>
      )}
    </dl>
  );
}
