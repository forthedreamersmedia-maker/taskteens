import type { TeenProfile } from "./types";

export function teenProfileCompletion(p: TeenProfile | null | undefined) {
  const checks: { key: string; label: string; done: boolean }[] = [
    { key: "age_range", label: "Add your age range", done: !!p?.age_range },
    { key: "city", label: "Add your city", done: !!p?.city },
    { key: "bio", label: "Write a short intro", done: !!p?.bio && p.bio.length >= 20 },
    { key: "skills", label: "List at least 3 skills", done: (p?.skills.length ?? 0) >= 3 },
    { key: "experience", label: "Describe your experience", done: !!p?.experience && p.experience.length >= 10 },
    { key: "availability", label: "Set your availability", done: !!p && Object.values(p.availability).some((v) => v.length) },
    { key: "transportation", label: "Choose how you get around", done: !!p?.transportation },
    { key: "resume", label: "Upload a résumé or add a portfolio link", done: !!p?.resume_path || !!p?.portfolio_url },
    { key: "work_permit_status", label: "Set work-permit status", done: !!p?.work_permit_status },
  ];
  const done = checks.filter((c) => c.done).length;
  return { percent: Math.round((done / checks.length) * 100), missing: checks.filter((c) => !c.done), checks };
}
