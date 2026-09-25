import type { JobFilters, JobWithEmployer } from "../types";
import { SERVICE_AREAS } from "../constants";
import { categoryName } from "../utils";

export function matchesFilters(job: JobWithEmployer, f: JobFilters): boolean {
  if (f.q) {
    const hay = [job.title, job.description, job.employer.display_name, categoryName(job.category), job.neighborhood ?? "", ...job.required_skills, ...job.preferred_skills]
      .join(" ")
      .toLowerCase();
    const terms = f.q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.every((t) => hay.includes(t))) return false;
  }
  if (f.city && job.city !== f.city && !(f.city === "Remote" && job.work_mode === "remote")) return false;
  if (f.area) {
    const area = SERVICE_AREAS.find((a) => a.slug === f.area);
    if (area && !area.cities.includes(job.city) && job.service_area !== f.area && !(f.area === "remote" && job.work_mode !== "in_person")) return false;
  }
  if (f.opportunity_type && (job.opportunity_type ?? "job") !== f.opportunity_type) return false;
  if (f.category && job.category !== f.category) return false;
  if (f.recurrence && job.recurrence !== f.recurrence) return false;
  if (f.work_mode && job.work_mode !== f.work_mode) return false;
  if (f.max_min_age && job.min_age > f.max_min_age) return false;
  if (f.pay_type && job.pay_type !== f.pay_type) return false;
  if (f.pay_min != null && !isNaN(f.pay_min) && (job.pay_max ?? job.pay_min) < f.pay_min) return false;
  if (f.pay_max != null && !isNaN(f.pay_max) && job.pay_min > f.pay_max) return false;
  if (f.schedule && !job.schedule_tags.includes(f.schedule)) return false;
  if (f.posted_within_days) {
    const posted = new Date(job.published_at ?? job.created_at).getTime();
    if (Date.now() - posted > f.posted_within_days * 86400000) return false;
  }
  return true;
}

export function sortJobs(jobs: JobWithEmployer[], sort: JobFilters["sort"] = "newest") {
  const copy = [...jobs];
  if (sort === "pay_high") copy.sort((a, b) => (b.pay_max ?? b.pay_min) - (a.pay_max ?? a.pay_min));
  else if (sort === "deadline") copy.sort((a, b) => (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999"));
  else copy.sort((a, b) => (b.published_at ?? b.created_at).localeCompare(a.published_at ?? a.created_at));
  return copy;
}

export function filtersFromSearchParams(sp: URLSearchParams): JobFilters {
  const num = (k: string) => (sp.get(k) ? Number(sp.get(k)) : undefined);
  return {
    q: sp.get("q") ?? undefined,
    city: sp.get("city") ?? undefined,
    area: sp.get("area") ?? undefined,
    category: sp.get("category") ?? undefined,
    opportunity_type: (sp.get("type") as JobFilters["opportunity_type"]) ?? undefined,
    recurrence: (sp.get("recurrence") as JobFilters["recurrence"]) ?? undefined,
    work_mode: (sp.get("mode") as JobFilters["work_mode"]) ?? undefined,
    max_min_age: num("age"),
    pay_type: (sp.get("pay_type") as JobFilters["pay_type"]) ?? undefined,
    pay_min: num("pay_min"),
    pay_max: num("pay_max"),
    schedule: sp.get("schedule") ?? undefined,
    posted_within_days: num("posted"),
    sort: (sp.get("sort") as JobFilters["sort"]) ?? "newest",
  };
}
