"use client";
import { SearchX, SlidersHorizontal, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { JobGrid } from "./job-card";
import { useSavedJobs } from "./use-saved-jobs";
import { EmptyState, ErrorState } from "@/components/ui/feedback";
import { useData } from "@/lib/auth-context";
import { useAsync } from "@/lib/hooks/use-async";
import { filtersFromSearchParams } from "@/lib/data/filters";
import { CITIES, SCHEDULE_TAGS } from "@/lib/constants";
import { useCategories, useServiceAreas } from "@/lib/hooks/use-reference";
import { cn } from "@/lib/utils";

const FILTER_KEYS = ["q", "city", "area", "category", "recurrence", "mode", "age", "pay_type", "pay_min", "pay_max", "schedule", "posted"];

export function JobsExplorer() {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const data = useData();
  const filters = useMemo(() => filtersFromSearchParams(new URLSearchParams(sp.toString())), [sp]);
  const { data: jobs, loading, error, reload } = useAsync(() => data.searchJobs(filters), [sp.toString()]);
  const { saved, toggle } = useSavedJobs();
  const [panelOpen, setPanelOpen] = useState(false);
  const CATEGORIES = useCategories();
  const SERVICE_AREAS = useServiceAreas();
  const [q, setQ] = useState(filters.q ?? "");
  useEffect(() => setQ(filters.q ?? ""), [filters.q]);

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(sp.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
  };
  const clearAll = () => router.replace(pathname, { scroll: false });
  const activeCount = FILTER_KEYS.filter((k) => sp.get(k)).length;

  const select = (key: string, label: string, options: { value: string; label: string }[], anyLabel = "Any") => (
    <div>
      <label htmlFor={`f-${key}`} className="label text-xs uppercase tracking-wide text-navy-500">{label}</label>
      <select id={`f-${key}`} className="input" value={sp.get(key) ?? ""} onChange={(e) => set(key, e.target.value)}>
        <option value="">{anyLabel}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );

  const panel = (
    <div className="space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          set("q", q.trim());
        }}
      >
        <label htmlFor="f-q" className="label text-xs uppercase tracking-wide text-navy-500">Keyword</label>
        <div className="flex gap-2">
          <input id="f-q" className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. tutor, dogs" />
          <button type="submit" className="btn-primary btn-sm rounded-xl">Go</button>
        </div>
      </form>
      {select("city", "City", CITIES.map((c) => ({ value: c, label: c })), "Any city")}
      {select("area", "Service area", SERVICE_AREAS.map((a) => ({ value: a.slug, label: a.name })), "All areas")}
      {select("category", "Category", CATEGORIES.map((c) => ({ value: c.slug, label: c.name })), "All categories")}
      {select("recurrence", "Job length", [{ value: "one_time", label: "One-time" }, { value: "recurring", label: "Recurring" }])}
      {select("mode", "Work setting", [{ value: "in_person", label: "In person" }, { value: "remote", label: "Remote" }, { value: "hybrid", label: "Hybrid" }])}
      {select("age", "I am", [14, 15, 16, 17, 18, 19].map((a) => ({ value: String(a), label: `${a} years old` })), "Any age")}
      {select("pay_type", "Pay type", [{ value: "hourly", label: "Hourly" }, { value: "flat", label: "Flat rate" }, { value: "stipend", label: "Stipend" }])}
      <fieldset>
        <legend className="label text-xs uppercase tracking-wide text-navy-500">Pay range ($)</legend>
        <div className="grid grid-cols-2 gap-2">
          <label className="sr-only" htmlFor="f-pay-min">Minimum pay</label>
          <input key={`pmin-${sp.get("pay_min") ?? ""}`} id="f-pay-min" type="number" min={0} inputMode="numeric" className="input" placeholder="Min" defaultValue={sp.get("pay_min") ?? ""} onBlur={(e) => set("pay_min", e.target.value)} />
          <label className="sr-only" htmlFor="f-pay-max">Maximum pay</label>
          <input key={`pmax-${sp.get("pay_max") ?? ""}`} id="f-pay-max" type="number" min={0} inputMode="numeric" className="input" placeholder="Max" defaultValue={sp.get("pay_max") ?? ""} onBlur={(e) => set("pay_max", e.target.value)} />
        </div>
        <p className="hint">Compares against the listing&apos;s own pay unit (hourly, flat or stipend).</p>
      </fieldset>
      {select("schedule", "Schedule", SCHEDULE_TAGS)}
      {select("posted", "Date posted", [{ value: "1", label: "Last 24 hours" }, { value: "3", label: "Last 3 days" }, { value: "7", label: "Last 7 days" }, { value: "30", label: "Last 30 days" }], "Any time")}
      {activeCount > 0 && (
        <button type="button" onClick={clearAll} className="btn-ghost btn-sm w-full">Clear all filters</button>
      )}
    </div>
  );

  return (
    <div className="container-page py-8 lg:py-12">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">Job marketplace</p>
          <h1 className="mt-1 text-3xl font-bold sm:text-4xl">Find local work</h1>
          <p className="mt-1 text-sm text-navy-500" aria-live="polite">
            {loading ? "Searching…" : `${jobs?.length ?? 0} ${jobs?.length === 1 ? "job" : "jobs"} in the East Bay`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="sort" className="sr-only">Sort by</label>
          <select id="sort" className="input w-auto" value={sp.get("sort") ?? "newest"} onChange={(e) => set("sort", e.target.value === "newest" ? "" : e.target.value)}>
            <option value="newest">Newest first</option>
            <option value="pay_high">Highest pay</option>
            <option value="deadline">Deadline soonest</option>
          </select>
          <button type="button" className="btn-outline lg:hidden" onClick={() => setPanelOpen(true)} aria-expanded={panelOpen} aria-controls="filters-drawer">
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" /> Filters{activeCount ? ` (${activeCount})` : ""}
          </button>
        </div>
      </div>

      <div className="mt-8 lg:grid lg:grid-cols-[270px_1fr] lg:gap-8">
        <aside aria-label="Filters" className="hidden lg:block">
          <div className="card sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto p-5">{panel}</div>
        </aside>

        {/* mobile drawer */}
        <div id="filters-drawer" className={cn("fixed inset-0 z-50 lg:hidden", panelOpen ? "" : "pointer-events-none")} aria-hidden={!panelOpen}>
          <div className={cn("absolute inset-0 bg-navy-900/40 transition-opacity", panelOpen ? "opacity-100" : "opacity-0")} onClick={() => setPanelOpen(false)} />
          <div role="dialog" aria-modal="true" aria-label="Job filters" className={cn("absolute inset-y-0 right-0 w-[min(22rem,90vw)] overflow-y-auto bg-cream-100 p-5 shadow-lift transition-transform", panelOpen ? "translate-x-0" : "translate-x-full")}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold">Filters</h2>
              <button type="button" className="rounded-full p-2 hover:bg-white" onClick={() => setPanelOpen(false)} aria-label="Close filters">
                <X className="h-5 w-5" />
              </button>
            </div>
            {panelOpen && panel}
            <button type="button" onClick={() => setPanelOpen(false)} className="btn-primary mt-6 w-full">Show {jobs?.length ?? 0} jobs</button>
          </div>
        </div>

        <div className="min-w-0">
          {error ? (
            <ErrorState message={error} onRetry={reload} />
          ) : !loading && jobs?.length === 0 ? (
            <EmptyState icon={SearchX} title="No jobs match those filters" body="Try widening your city, schedule or pay range — new listings are added often." action={activeCount ? { label: "Clear filters", onClick: clearAll } : undefined} />
          ) : (
            <JobGrid jobs={jobs} loading={loading} saved={saved} onToggleSave={toggle} />
          )}
        </div>
      </div>
    </div>
  );
}
