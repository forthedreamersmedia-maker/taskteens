"use client";
import { FileText, Trash2, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import { TeenShell } from "@/components/dashboard/teen-shell";
import { Field } from "@/components/ui/field";
import { ErrorState, PageLoader } from "@/components/ui/feedback";
import { TagInput } from "@/components/ui/tag-input";
import { useToast } from "@/components/ui/toast";
import { useData } from "@/lib/auth-context";
import { useAsync } from "@/lib/hooks/use-async";
import { AGE_RANGES, CITIES, DAY_PARTS, DAYS, GUARDIAN_CONSENT_LABEL, TRANSPORTATION_LABEL, WORK_PERMIT_LABEL } from "@/lib/constants";
import type { TeenProfile } from "@/lib/types";
import { teenProfileCompletion } from "@/lib/profile-completion";
import { containsSensitiveNumber } from "@/lib/validation";
import { cn, errorMessage } from "@/lib/utils";

const SKILL_SUGGESTIONS = ["Customer service", "Pet care", "Tutoring", "Childcare", "Photography", "Social media", "Google Sheets", "Bilingual", "Organized", "Reliable", "Yard work", "Tech help"];

export default function TeenProfilePage() {
  const data = useData();
  const toast = useToast();
  const { data: profile, loading, error, reload } = useAsync(() => data.getTeenProfile(), []);
  const [p, setP] = useState<TeenProfile | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [errs, setErrs] = useState<Record<string, string>>({});
  useEffect(() => setP(profile ?? null), [profile]);

  if (loading || (!p && !error)) return <TeenShell title="Profile & résumé"><PageLoader /></TeenShell>;
  if (error || !p) return <TeenShell title="Profile & résumé"><ErrorState message={error ?? "Profile not found"} onRetry={reload} /></TeenShell>;

  const set = <K extends keyof TeenProfile>(k: K, v: TeenProfile[K]) => setP((x) => (x ? { ...x, [k]: v } : x));
  const toggleSlot = (day: string, part: string) => {
    const cur = p.availability[day] ?? [];
    set("availability", { ...p.availability, [day]: cur.includes(part) ? cur.filter((x) => x !== part) : [...cur, part] });
  };
  const completion = teenProfileCompletion(p);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!p.display_name.trim()) next.display_name = "Enter a display name.";
    if (p.bio && containsSensitiveNumber(p.bio)) next.bio = "Remove anything that looks like an ID number.";
    if (p.portfolio_url && !/^https?:\/\/.+\..+/.test(p.portfolio_url)) next.portfolio_url = "Link must start with http:// or https://";
    if (p.city && /\d{2,5}\s+\w+\s+(st|street|ave|avenue|rd|road|way|dr|drive)\b/i.test(p.city)) next.city = "City only, please — no street address.";
    setErrs(next);
    if (Object.keys(next).length) return;
    setSaving(true);
    try {
      const saved = await data.updateTeenProfile(p);
      setP(saved);
      toast({ tone: "success", title: "Profile saved" });
    } catch (err) {
      toast({ tone: "error", title: "Couldn't save profile", body: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  };

  const upload = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return toast({ tone: "error", title: "Résumé must be under 5 MB" });
    setUploading(true);
    try {
      const r = await data.uploadResume(file);
      const saved = await data.updateTeenProfile({ resume_path: r.path, resume_name: r.name });
      setP(saved);
      toast({ tone: "success", title: "Résumé uploaded" });
    } catch (err) {
      toast({ tone: "error", title: "Upload failed", body: errorMessage(err) });
    } finally {
      setUploading(false);
    }
  };

  return (
    <TeenShell title="Profile & résumé" subtitle={`${completion.percent}% complete · Your profile is private. It's used to prefill applications — employers only see what you submit.`}>
      <form onSubmit={save} noValidate className="space-y-6">
        <section className="card grid gap-5 p-5 sm:grid-cols-2 sm:p-6" aria-labelledby="basics">
          <h2 id="basics" className="text-lg font-bold sm:col-span-2">Basics</h2>
          <Field label="Display name" required error={errs.display_name} hint="e.g. first name and last initial">
            <input className="input" value={p.display_name} onChange={(e) => set("display_name", e.target.value)} />
          </Field>
          <Field label="Age range">
            <select className="input" value={p.age_range ?? ""} onChange={(e) => set("age_range", (e.target.value || null) as TeenProfile["age_range"])}>
              <option value="">Choose…</option>
              {AGE_RANGES.map((a) => <option key={a}>{a}</option>)}
            </select>
          </Field>
          <Field label="City" error={errs.city} hint="City only — never your street address.">
            <select className="input" value={p.city ?? ""} onChange={(e) => set("city", e.target.value || null)}>
              <option value="">Choose…</option>
              {CITIES.filter((c) => c !== "Remote").map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Getting around">
            <select className="input" value={p.transportation ?? ""} onChange={(e) => set("transportation", (e.target.value || null) as TeenProfile["transportation"])}>
              <option value="">Choose…</option>
              {Object.entries(TRANSPORTATION_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field>
          <Field label="Short intro" className="sm:col-span-2" error={errs.bio} hint={`${(p.bio ?? "").length}/1000`}>
            <textarea className="input min-h-[90px]" maxLength={1000} value={p.bio ?? ""} onChange={(e) => set("bio", e.target.value)} />
          </Field>
        </section>

        <section className="card space-y-5 p-5 sm:p-6" aria-labelledby="skills">
          <h2 id="skills" className="text-lg font-bold">Skills &amp; experience</h2>
          <Field label="Skills" hint="Press Enter after each one.">
            <TagInput value={p.skills} onChange={(v) => set("skills", v)} suggestions={SKILL_SUGGESTIONS} />
          </Field>
          <Field label="Experience">
            <textarea className="input min-h-[100px]" maxLength={2000} value={p.experience ?? ""} onChange={(e) => set("experience", e.target.value)} placeholder="Volunteering, clubs, sports, family responsibilities, past jobs…" />
          </Field>
        </section>

        <section className="card p-5 sm:p-6" aria-labelledby="avail">
          <h2 id="avail" className="text-lg font-bold">Availability</h2>
          <p className="mt-1 text-sm text-navy-500">Tap the times you can usually work. This is private and only used to prefill applications — it never reveals your school schedule.</p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[480px] border-separate border-spacing-1 text-sm">
              <thead>
                <tr>
                  <th className="sr-only">Time of day</th>
                  {DAYS.map((d) => <th key={d.key} scope="col" className="pb-1 text-xs font-semibold text-navy-500">{d.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {DAY_PARTS.map((part) => (
                  <tr key={part}>
                    <th scope="row" className="pr-2 text-left text-xs font-medium capitalize text-navy-500">{part}</th>
                    {DAYS.map((d) => {
                      const on = (p.availability[d.key] ?? []).includes(part);
                      return (
                        <td key={d.key}>
                          <button type="button" onClick={() => toggleSlot(d.key, part)} aria-pressed={on} aria-label={`${d.label} ${part}`} className={cn("h-10 w-full rounded-xl border text-xs font-semibold transition", on ? "border-bay-500 bg-bay-500 text-white" : "border-navy-100 bg-cream-100 text-transparent hover:border-bay-300")}>
                            ✓
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card grid gap-5 p-5 sm:grid-cols-2 sm:p-6" aria-labelledby="resume">
          <h2 id="resume" className="text-lg font-bold sm:col-span-2">Résumé &amp; portfolio</h2>
          <div>
            <p className="label">Résumé</p>
            {p.resume_name ? (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-navy-200 bg-white px-3 py-2.5 text-sm">
                <span className="flex min-w-0 items-center gap-2"><FileText className="h-4 w-4 shrink-0 text-navy-400" aria-hidden="true" /><span className="truncate">{p.resume_name}</span></span>
                <button type="button" onClick={() => setP((x) => (x ? { ...x, resume_path: null, resume_name: null } : x))} className="rounded-full p-1 text-navy-400 hover:bg-coral-50 hover:text-coral-600" aria-label="Remove résumé (save to apply)">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <p className="text-sm text-navy-400">No résumé uploaded.</p>
            )}
            <label className="btn-outline btn-sm mt-2 cursor-pointer">
              <Upload className="h-3.5 w-3.5" aria-hidden="true" /> {uploading ? "Uploading…" : p.resume_name ? "Replace" : "Upload PDF/Word"}
              <input type="file" accept=".pdf,.doc,.docx" className="sr-only" onChange={(e) => upload(e.target.files?.[0])} disabled={uploading} />
            </label>
          </div>
          <Field label="Portfolio link" optional error={errs.portfolio_url}>
            <input type="url" className="input" value={p.portfolio_url ?? ""} onChange={(e) => set("portfolio_url", e.target.value || null)} placeholder="https://" />
          </Field>
        </section>

        <section className="card grid gap-5 p-5 sm:grid-cols-2 sm:p-6" aria-labelledby="permits">
          <h2 id="permits" className="text-lg font-bold sm:col-span-2">Work permit &amp; consent</h2>
          <Field label="Work-permit status">
            <select className="input" value={p.work_permit_status ?? ""} onChange={(e) => set("work_permit_status", (e.target.value || null) as TeenProfile["work_permit_status"])}>
              <option value="">Choose…</option>
              {Object.entries(WORK_PERMIT_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field>
          <Field label="Guardian consent">
            <select className="input" value={p.guardian_consent_status ?? ""} onChange={(e) => set("guardian_consent_status", (e.target.value || null) as TeenProfile["guardian_consent_status"])}>
              <option value="">Choose…</option>
              {Object.entries(GUARDIAN_CONSENT_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field>
        </section>

        <div className="sticky bottom-4 z-10 flex justify-end">
          <button type="submit" disabled={saving} className="btn-primary btn-lg shadow-lift">{saving ? "Saving…" : "Save profile"}</button>
        </div>
      </form>
    </TeenShell>
  );
}
