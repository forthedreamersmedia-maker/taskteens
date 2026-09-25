"use client";
import { ImagePlus, Plus, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Field, FieldsetGroup } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { SafeImage } from "@/components/ui/image";
import { TagInput } from "@/components/ui/tag-input";
import { useToast } from "@/components/ui/toast";
import { useData } from "@/lib/auth-context";
import { useAsync } from "@/lib/hooks/use-async";
import { CATEGORY_IMAGES, CITIES, NEIGHBORHOODS, SCHEDULE_TAGS, TRANSPORTATION_LABEL } from "@/lib/constants";
import { useCategories, useServiceAreas } from "@/lib/hooks/use-reference";
import type { Job, JobInput, JobStatus } from "@/lib/types";
import { fieldErrors, jobSchema, LOW_HOURLY_WARNING_THRESHOLD } from "@/lib/validation";
import { cn, errorMessage } from "@/lib/utils";

type FormState = Omit<JobInput, "pay_min" | "pay_max" | "min_age" | "openings"> & { pay_min: string; pay_max: string; min_age: string; openings: string };

function fromJob(j?: Job | null): FormState {
  return {
    title: j?.title ?? "",
    category: j?.category ?? "",
    description: j?.description ?? "",
    responsibilities: j?.responsibilities?.length ? j.responsibilities : [""],
    required_skills: j?.required_skills ?? [],
    preferred_skills: j?.preferred_skills ?? [],
    city: j?.city ?? "",
    neighborhood: j?.neighborhood ?? "",
    service_area: j?.service_area ?? "",
    work_mode: j?.work_mode ?? "in_person",
    pay_type: j?.pay_type ?? "hourly",
    pay_min: j ? String(j.pay_min) : "",
    pay_max: j?.pay_max != null ? String(j.pay_max) : "",
    schedule: j?.schedule ?? "",
    schedule_tags: j?.schedule_tags ?? [],
    min_age: String(j?.min_age ?? 14),
    start_date: j?.start_date ?? "",
    recurrence: j?.recurrence ?? "recurring",
    openings: String(j?.openings ?? 1),
    deadline: j?.deadline ?? "",
    transportation: j?.transportation ?? "bike_or_walk",
    transportation_notes: j?.transportation_notes ?? "",
    status: j?.status ?? "draft",
    image_url: j?.image_url ?? null,
  };
}

export function JobForm({ job }: { job?: Job | null }) {
  const data = useData();
  const router = useRouter();
  const toast = useToast();
  const { data: settings } = useAsync(() => data.getSettings(), []);
  const CATEGORIES = useCategories();
  const SERVICE_AREAS = useServiceAreas();
  const [f, setF] = useState<FormState>(() => fromJob(job));
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(job?.image_url ?? null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<JobStatus | null>(null);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setF((x) => ({ ...x, [k]: v }));
    if (errors[k as string]) setErrors((e) => ({ ...e, [k]: "" }));
  };
  const lowPay = f.pay_type === "hourly" && Number(f.pay_min) > 0 && Number(f.pay_min) < LOW_HOURLY_WARNING_THRESHOLD;
  const neighborhoods = useMemo(() => NEIGHBORHOODS[f.city] ?? [], [f.city]);

  const onImage = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return setErrors((e) => ({ ...e, image: "Choose a JPG, PNG or WebP image." }));
    if (file.size > 5 * 1024 * 1024) return setErrors((e) => ({ ...e, image: "Image must be under 5 MB." }));
    setImageFile(file);
    setPreview(URL.createObjectURL(file));
    setErrors((e) => ({ ...e, image: "" }));
  };

  const submit = async (status: JobStatus) => {
    const candidate = {
      ...f,
      status,
      responsibilities: f.responsibilities.map((r) => r.trim()).filter(Boolean),
      pay_max: f.pay_max ? Number(f.pay_max) : null,
      neighborhood: f.neighborhood || null,
      start_date: f.start_date || null,
      deadline: f.deadline || null,
      transportation_notes: f.transportation_notes || null,
      service_area: f.service_area || SERVICE_AREAS.find((a) => a.cities.includes(f.city))?.slug || "",
    };
    const parsed = jobSchema.safeParse(candidate);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      toast({ tone: "error", title: "Please fix the highlighted fields" });
      return;
    }
    const payload = parsed.data as unknown as JobInput;
    setBusy(status);
    try {
      const input: JobInput = { ...payload, image_file: imageFile, image_url: imageFile ? null : preview ?? CATEGORY_IMAGES[payload.category] ?? null };
      if (job) await data.updateJob(job.id, input);
      else await data.createJob(input);
      toast({
        tone: "success",
        title: status === "draft" ? "Draft saved" : job ? "Listing updated" : "Listing submitted",
        body: status === "published" && settings?.require_job_approval && job?.moderation_status !== "approved" ? "It will go live after a quick moderator review." : undefined,
      });
      router.push("/dashboard/employer/listings");
    } catch (e) {
      toast({ tone: "error", title: "Couldn't save listing", body: errorMessage(e) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); submit("published"); }} noValidate className="space-y-6">
      {settings?.require_job_approval && <Alert tone="info">New listings are reviewed by a TaskTeens moderator before they appear publicly — usually quickly.</Alert>}

      <section className="card space-y-5 p-5 sm:p-6" aria-labelledby="s-basics">
        <h2 id="s-basics" className="text-lg font-bold">The basics</h2>
        <Field label="Job title" required error={errors.title}><input className="input" value={f.title} onChange={(e) => set("title", e.target.value)} maxLength={90} placeholder="e.g. After-school dog walker" /></Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Category" required error={errors.category}>
            <select className="input" value={f.category} onChange={(e) => set("category", e.target.value)}>
              <option value="">Choose…</option>
              {CATEGORIES.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Work setting" required>
            <select className="input" value={f.work_mode} onChange={(e) => set("work_mode", e.target.value as FormState["work_mode"])}>
              <option value="in_person">In person</option><option value="hybrid">Hybrid</option><option value="remote">Remote</option>
            </select>
          </Field>
        </div>
        <Field label="Description" required error={errors.description} hint={`${f.description.length}/4000 — what the job is, who they'll work with, what a typical shift looks like.`}>
          <textarea className="input min-h-[140px]" value={f.description} onChange={(e) => set("description", e.target.value)} maxLength={4000} />
        </Field>
        <FieldsetGroup legend="Responsibilities *" error={errors.responsibilities}>
          <div className="space-y-2">
            {f.responsibilities.map((r, i) => (
              <div key={i} className="flex gap-2">
                <label className="sr-only" htmlFor={`resp-${i}`}>Responsibility {i + 1}</label>
                <input id={`resp-${i}`} className="input" value={r} onChange={(e) => set("responsibilities", f.responsibilities.map((x, j) => (j === i ? e.target.value : x)))} placeholder={`Responsibility ${i + 1}`} />
                {f.responsibilities.length > 1 && (
                  <button type="button" className="rounded-xl p-2.5 text-navy-400 hover:bg-coral-50 hover:text-coral-600" onClick={() => set("responsibilities", f.responsibilities.filter((_, j) => j !== i))} aria-label={`Remove responsibility ${i + 1}`}>
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
            {f.responsibilities.length < 10 && (
              <button type="button" className="btn-ghost btn-sm" onClick={() => set("responsibilities", [...f.responsibilities, ""])}><Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add responsibility</button>
            )}
          </div>
        </FieldsetGroup>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Required skills" hint="Press Enter after each."><TagInput value={f.required_skills} onChange={(v) => set("required_skills", v)} /></Field>
          <Field label="Preferred skills" optional><TagInput value={f.preferred_skills} onChange={(v) => set("preferred_skills", v)} /></Field>
        </div>
      </section>

      <section className="card space-y-5 p-5 sm:p-6" aria-labelledby="s-loc">
        <h2 id="s-loc" className="text-lg font-bold">Location</h2>
        <Alert tone="warn">Don&apos;t enter a street address. Listings show only the city and an approximate neighborhood. Share the exact location privately after you&apos;ve selected someone.</Alert>
        <div className="grid gap-5 sm:grid-cols-3">
          <Field label="City" required error={errors.city}>
            <select className="input" value={f.city} onChange={(e) => { set("city", e.target.value); set("service_area", SERVICE_AREAS.find((a) => a.cities.includes(e.target.value))?.slug ?? ""); }}>
              <option value="">Choose…</option>
              {CITIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Approximate neighborhood" optional error={errors.neighborhood}>
            <input className="input" list="nbhd" value={f.neighborhood ?? ""} onChange={(e) => set("neighborhood", e.target.value)} placeholder="e.g. North Berkeley" />
          </Field>
          <datalist id="nbhd">{neighborhoods.map((n) => <option key={n} value={n} />)}</datalist>
          <Field label="Service area" error={errors.service_area}>
            <select className="input" value={f.service_area} onChange={(e) => set("service_area", e.target.value)}>
              <option value="">Auto from city</option>
              {SERVICE_AREAS.map((a) => <option key={a.slug} value={a.slug}>{a.name}</option>)}
            </select>
          </Field>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Transportation" required>
            <select className="input" value={f.transportation} onChange={(e) => set("transportation", e.target.value as FormState["transportation"])}>
              {Object.entries(TRANSPORTATION_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field>
          <Field label="Transportation notes" optional><input className="input" value={f.transportation_notes ?? ""} onChange={(e) => set("transportation_notes", e.target.value)} placeholder="e.g. 5 min walk from El Cerrito Plaza BART" /></Field>
        </div>
      </section>

      <section className="card space-y-5 p-5 sm:p-6" aria-labelledby="s-pay">
        <h2 id="s-pay" className="text-lg font-bold">Pay &amp; schedule</h2>
        <div className="grid gap-5 sm:grid-cols-3">
          <Field label="Pay type" required>
            <select className="input" value={f.pay_type} onChange={(e) => set("pay_type", e.target.value as FormState["pay_type"])}>
              <option value="hourly">Hourly</option><option value="flat">Flat rate</option><option value="stipend">Stipend</option>
            </select>
          </Field>
          <Field label={f.pay_type === "hourly" ? "Min $/hr" : "Amount ($)"} required error={errors.pay_min}><input type="number" min={0} step="0.25" inputMode="decimal" className="input" value={f.pay_min} onChange={(e) => set("pay_min", e.target.value)} /></Field>
          <Field label={f.pay_type === "hourly" ? "Max $/hr" : "Up to ($)"} optional error={errors.pay_max}><input type="number" min={0} step="0.25" inputMode="decimal" className="input" value={f.pay_max} onChange={(e) => set("pay_max", e.target.value)} /></Field>
        </div>
        {lowPay && <Alert tone="warn">This hourly rate may be below local minimum wage. Berkeley, Albany and El Cerrito set their own minimums — please confirm current rates before publishing.</Alert>}
        <Field label="Schedule" required error={errors.schedule} hint="e.g. “Tue & Thu, 3–6 pm” or “One Saturday, ~5 hours”"><input className="input" value={f.schedule} onChange={(e) => set("schedule", e.target.value)} /></Field>
        <FieldsetGroup legend="Schedule tags" hint="Helps teens filter.">
          <div className="flex flex-wrap gap-2">
            {SCHEDULE_TAGS.map((t) => {
              const on = f.schedule_tags.includes(t.value);
              return (
                <button key={t.value} type="button" aria-pressed={on} onClick={() => set("schedule_tags", on ? f.schedule_tags.filter((x) => x !== t.value) : [...f.schedule_tags, t.value])} className={cn("rounded-full border px-3 py-1.5 text-sm", on ? "border-bay-500 bg-bay-500 text-white" : "border-navy-200 bg-white hover:border-bay-300")}>
                  {t.label}
                </button>
              );
            })}
          </div>
        </FieldsetGroup>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Job length" required>
            <select className="input" value={f.recurrence} onChange={(e) => set("recurrence", e.target.value as FormState["recurrence"])}>
              <option value="recurring">Recurring</option><option value="one_time">One-time</option>
            </select>
          </Field>
          <Field label="Minimum age" required error={errors.min_age}>
            <select className="input" value={f.min_age} onChange={(e) => set("min_age", e.target.value)}>
              {Array.from({ length: 6 }, (_, i) => i + Math.max(14, settings?.min_worker_age ?? 14)).filter((a) => a <= 19).map((a) => <option key={a} value={a}>{a}+</option>)}
            </select>
          </Field>
          <Field label="Openings" required error={errors.openings}><input type="number" min={1} max={50} className="input" value={f.openings} onChange={(e) => set("openings", e.target.value)} /></Field>
          <Field label="Start date" optional><input type="date" className="input" value={f.start_date ?? ""} onChange={(e) => set("start_date", e.target.value)} /></Field>
          <Field label="Application deadline" optional error={errors.deadline}><input type="date" className="input" value={f.deadline ?? ""} onChange={(e) => set("deadline", e.target.value)} min={new Date().toISOString().slice(0, 10)} /></Field>
        </div>
      </section>

      <section className="card p-5 sm:p-6" aria-labelledby="s-img">
        <h2 id="s-img" className="text-lg font-bold">Cover image</h2>
        <p className="mt-1 text-sm text-navy-500">Optional. Use a photo of the workplace or the kind of work — never a photo that shows your house number or a child&apos;s face. We&apos;ll use a category photo if you skip this.</p>
        <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center">
          <SafeImage src={preview ?? (f.category ? CATEGORY_IMAGES[f.category] : null)} alt="Listing cover preview" className="aspect-[16/9] w-full rounded-2xl sm:w-64" fallbackLabel="No image" />
          <div className="flex flex-wrap gap-2">
            <label className="btn-outline cursor-pointer"><ImagePlus className="h-4 w-4" aria-hidden="true" /> Upload image<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => onImage(e.target.files?.[0])} /></label>
            {(preview || imageFile) && <button type="button" className="btn-ghost" onClick={() => { setPreview(null); setImageFile(null); }}><Trash2 className="h-4 w-4" aria-hidden="true" /> Remove</button>}
          </div>
        </div>
        {errors.image && <p className="field-error">{errors.image}</p>}
      </section>

      <div className="sticky bottom-4 z-10 flex flex-wrap justify-end gap-2 rounded-3xl bg-cream-100/90 p-2 backdrop-blur">
        <button type="button" className="btn-outline" onClick={() => router.back()}>Cancel</button>
        <button type="button" className="btn-outline" disabled={!!busy} onClick={() => submit("draft")}>{busy === "draft" ? "Saving…" : "Save as draft"}</button>
        <button type="submit" className="btn-coral" disabled={!!busy}>{busy === "published" ? "Publishing…" : job?.status === "published" ? "Save changes" : "Publish listing"}</button>
      </div>
    </form>
  );
}
