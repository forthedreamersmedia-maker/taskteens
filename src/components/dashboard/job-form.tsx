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
import { CATEGORY_IMAGES, CITIES, NEIGHBORHOODS, OPPORTUNITY_TYPES, PILOT_ALLOWED, PILOT_PROHIBITED, SCHEDULE_TAGS, TRANSPORTATION_LABEL, WORK_SETTING_LABEL } from "@/lib/constants";
import { safetySupabase, useSafetyQuery } from "@/lib/safety/client";
import { ADDRESS_STATUS_LABEL, type AddressStatus } from "@/lib/safety/verification";
import Link from "next/link";
import { useCategories, useServiceAreas } from "@/lib/hooks/use-reference";
import type { Job, JobInput, JobStatus, OpportunityType } from "@/lib/types";
import { fieldErrors, jobSchema, LOW_HOURLY_WARNING_THRESHOLD } from "@/lib/validation";
import { cn, errorMessage } from "@/lib/utils";

type FormState = Omit<JobInput, "pay_min" | "pay_max" | "min_age" | "openings" | "duration_minutes"> & { pay_min: string; pay_max: string; min_age: string; openings: string; duration_minutes: string };

function fromJob(j?: Job | null): FormState {
  return {
    title: j?.title ?? "",
    opportunity_type: j?.opportunity_type ?? "job",
    nonprofit_attested: j?.nonprofit_attested ?? false,
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
    start_time: j?.start_time ? j.start_time.slice(0, 5) : "",
    duration_minutes: j?.duration_minutes ? String(j.duration_minutes) : "",
    work_setting: j?.work_setting ?? null,
    supervision: j?.supervision ?? "",
    equipment: j?.equipment ?? "",
    known_risks: j?.known_risks ?? "",
    address_id: j?.address_id ?? null,
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
  const addresses = useSafetyQuery(async (sb) => ((await sb.from("employer_addresses").select("id,line1,city,status").order("created_at")).data ?? []) as { id: string; line1: string; city: string; status: AddressStatus }[], []);
  const live = !!safetySupabase();
  const policyOf = (slug: string) => CATEGORIES.find((c) => c.slug === slug)?.pilot_policy ?? "review";

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setF((x) => ({ ...x, [k]: v }));
    if (errors[k as string]) setErrors((e) => ({ ...e, [k]: "" }));
  };
  const lowPay = f.pay_type === "hourly" && Number(f.pay_min) > 0 && Number(f.pay_min) < LOW_HOURLY_WARNING_THRESHOLD;
  const unpaid = f.pay_type === "unpaid";
  const setType = (t: OpportunityType) => {
    setF((x) => ({
      ...x,
      opportunity_type: t,
      // Volunteer roles are always unpaid; paid jobs can't be unpaid.
      pay_type: t === "volunteer" ? "unpaid" : x.pay_type === "unpaid" && t === "job" ? "hourly" : x.pay_type,
      pay_min: t === "volunteer" ? "0" : x.pay_type === "unpaid" && t === "job" ? "" : x.pay_min,
      pay_max: t === "volunteer" ? "" : x.pay_max,
    }));
    setErrors((e) => ({ ...e, pay_type: "", pay_min: "", nonprofit_attested: "" }));
  };
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
      pay_min: unpaid ? 0 : f.pay_min,
      pay_max: unpaid ? null : f.pay_max ? Number(f.pay_max) : null,
      nonprofit_attested: unpaid ? f.nonprofit_attested : false,
      neighborhood: f.neighborhood || null,
      start_date: f.start_date || null,
      deadline: f.deadline || null,
      transportation_notes: f.transportation_notes || null,
      service_area: f.service_area || SERVICE_AREAS.find((a) => a.cities.includes(f.city))?.slug || "",
      start_time: f.start_time || null,
      duration_minutes: f.duration_minutes ? Number(f.duration_minutes) : null,
      supervision: f.supervision?.trim() || null,
      equipment: f.equipment?.trim() || null,
      known_risks: f.known_risks?.trim() || null,
      address_id: f.address_id || null,
      // Demo mode has no private addresses or verification; only the live database enforces these.
      ...(live ? {} : { address_id: null }),
    };
    const parsed = jobSchema.safeParse(live ? candidate : { ...candidate, status: candidate.status === "published" ? "draft" : candidate.status });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      toast({ tone: "error", title: "Please fix the highlighted fields" });
      return;
    }
    const payload = { ...(parsed.data as unknown as JobInput), status } as JobInput;
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
      <Alert tone="warn" title="Pilot job rules">
        <p>Allowed during the pilot: {PILOT_ALLOWED.join(", ")}. Other categories are held for moderator review.</p>
        <p className="mt-1">Not allowed: {PILOT_PROHIBITED.join(" · ")}. Listings that mention these are flagged automatically for a human moderator.</p>
      </Alert>

      <section className="card space-y-5 p-5 sm:p-6" aria-labelledby="s-basics">
        <h2 id="s-basics" className="text-lg font-bold">The basics</h2>
        <FieldsetGroup legend="What kind of opportunity is this? *">
          <div className="grid gap-2 sm:grid-cols-3">
            {OPPORTUNITY_TYPES.map((o) => (
              <label key={o.value} className={cn("flex cursor-pointer flex-col rounded-2xl border-2 p-3 transition", f.opportunity_type === o.value ? "border-bay-500 bg-bay-50" : "border-navy-100 bg-white hover:border-navy-200")}>
                <input type="radio" name="opportunity_type" value={o.value} checked={f.opportunity_type === o.value} onChange={() => setType(o.value)} className="sr-only" />
                <span className="text-sm font-semibold">{o.label}</span>
                <span className="text-xs text-navy-500">{o.body}</span>
              </label>
            ))}
          </div>
        </FieldsetGroup>
        <Field label={f.opportunity_type === "job" ? "Job title" : f.opportunity_type === "internship" ? "Internship title" : "Volunteer role title"} required error={errors.title}><input className="input" value={f.title} onChange={(e) => set("title", e.target.value)} maxLength={90} placeholder="e.g. After-school dog walker" /></Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Category" required error={errors.category}>
            <select className="input" value={f.category} onChange={(e) => set("category", e.target.value)}>
              <option value="">Choose…</option>
              {CATEGORIES.filter((c) => c.pilot_policy !== "prohibited").map((c) => <option key={c.slug} value={c.slug}>{c.name}{c.pilot_policy === "review" ? " (moderator review)" : ""}</option>)}
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
        <Alert tone="warn">Don&apos;t enter a street address. Listings show only the city and an approximate neighborhood. Choose your private service address in the safety section — TaskTeens releases it only after a parent approves the job.</Alert>
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
        <h2 id="s-pay" className="text-lg font-bold">{f.opportunity_type === "volunteer" ? "Schedule" : "Pay & schedule"}</h2>
        {f.opportunity_type === "volunteer" ? (
          <p className="rounded-2xl bg-cream-100 p-3 text-sm text-navy-600">Volunteer roles are unpaid. Many schools accept volunteer work toward community-service hours — mention it in the description if you can sign off on hours.</p>
        ) : (
          <div className="grid gap-5 sm:grid-cols-3">
            <Field label="Pay type" required error={errors.pay_type}>
              <select className="input" value={f.pay_type} onChange={(e) => set("pay_type", e.target.value as FormState["pay_type"])}>
                <option value="hourly">Hourly</option><option value="flat">Flat rate</option><option value="stipend">Stipend</option>
                {f.opportunity_type === "internship" && <option value="unpaid">Unpaid (nonprofits only)</option>}
              </select>
            </Field>
            {!unpaid && (
              <>
                <Field label={f.pay_type === "hourly" ? "Min $/hr" : "Amount ($)"} required error={errors.pay_min}><input type="number" min={0} step="0.25" inputMode="decimal" className="input" value={f.pay_min} onChange={(e) => set("pay_min", e.target.value)} /></Field>
                <Field label={f.pay_type === "hourly" ? "Max $/hr" : "Up to ($)"} optional error={errors.pay_max}><input type="number" min={0} step="0.25" inputMode="decimal" className="input" value={f.pay_max} onChange={(e) => set("pay_max", e.target.value)} /></Field>
              </>
            )}
          </div>
        )}
        {unpaid && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p>
              TaskTeens only allows unpaid {f.opportunity_type === "volunteer" ? "volunteer roles" : "internships"} from nonprofits, schools, public agencies and community groups.
              For-profit businesses and households must pay — labor laws generally don&apos;t allow unpaid work for a for-profit employer. This isn&apos;t legal advice; check the rules that apply to you.
            </p>
            <label className="mt-3 flex items-start gap-2.5 font-medium">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-bay-500" checked={f.nonprofit_attested} onChange={(e) => set("nonprofit_attested", e.target.checked)} />
              <span>I confirm this role is with a nonprofit, school, public agency or community group, and no one is being asked to do work that would normally be paid.</span>
            </label>
            {errors.nonprofit_attested && <p className="field-error">{errors.nonprofit_attested}</p>}
          </div>
        )}
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
          <Field label="Application deadline" optional error={errors.deadline}><input type="date" className="input" value={f.deadline ?? ""} onChange={(e) => set("deadline", e.target.value)} min={new Date().toISOString().slice(0, 10)} /></Field>
        </div>
      </section>

      <section className="card space-y-5 p-5 sm:p-6" aria-labelledby="s-safety">
        <div>
          <h2 id="s-safety" className="text-lg font-bold">Date, supervision &amp; safety</h2>
          <p className="mt-1 text-sm text-navy-500">Required to publish. Parents read this before approving the job, and any later change to these details asks them to approve again.</p>
        </div>
        {f.category && policyOf(f.category) === "review" && <Alert tone="info">This category is held for moderator review during the pilot.</Alert>}
        <div className="grid gap-5 sm:grid-cols-3">
          <Field label="Date" required error={errors.start_date}><input type="date" className="input" value={f.start_date ?? ""} min={new Date().toISOString().slice(0, 10)} onChange={(e) => set("start_date", e.target.value)} /></Field>
          <Field label="Start time" required error={errors.start_time}><input type="time" className="input" value={f.start_time ?? ""} onChange={(e) => set("start_time", e.target.value)} /></Field>
          <Field label="Expected duration" required error={errors.duration_minutes}>
            <select className="input" value={f.duration_minutes} onChange={(e) => set("duration_minutes", e.target.value)}>
              <option value="">Choose…</option>
              {[30, 45, 60, 90, 120, 150, 180, 240, 300, 360].map((m) => <option key={m} value={m}>{m < 60 ? `${m} min` : `${m / 60} hr${m > 60 ? "s" : ""}`}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Where the work happens" required error={errors.work_setting}>
          <select className="input" value={f.work_setting ?? ""} onChange={(e) => set("work_setting", (e.target.value || null) as FormState["work_setting"])}>
            <option value="">Choose…</option>
            {Object.entries(WORK_SETTING_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
        <Field label="Supervision" required error={errors.supervision} hint="Who is the adult on site, and will they be there the whole time? Teens may not be alone inside a home.">
          <textarea className="input min-h-[70px]" maxLength={500} value={f.supervision ?? ""} onChange={(e) => set("supervision", e.target.value)} placeholder="e.g. I (adult homeowner) will be in the yard the whole time." />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Equipment" required error={errors.equipment} hint="What you provide and what to bring. No power tools during the pilot."><textarea className="input min-h-[70px]" maxLength={500} value={f.equipment ?? ""} onChange={(e) => set("equipment", e.target.value)} placeholder="e.g. Rakes, gloves and bags provided." /></Field>
          <Field label="Known risks" required error={errors.known_risks} hint="Pets, uneven ground, stairs, allergies… or “None known”."><textarea className="input min-h-[70px]" maxLength={500} value={f.known_risks ?? ""} onChange={(e) => set("known_risks", e.target.value)} placeholder="e.g. Friendly dog in the house (stays inside)." /></Field>
        </div>
        {f.work_setting !== "remote" && (
          <Field label="Service address (private)" required error={errors.address_id} hint="Shown only to the teen and their parent after the parent approves this job.">
            {!live ? <p className="text-sm text-navy-500">Private addresses require the live backend.</p> : (addresses.data?.length ?? 0) === 0 ? (
              <p className="text-sm text-navy-600">Add a service address on your <Link href="/dashboard/employer/verification" className="link">Verification</Link> page first.</p>
            ) : (
              <select className="input" value={f.address_id ?? ""} onChange={(e) => set("address_id", e.target.value || null)}>
                <option value="">Choose…</option>
                {addresses.data!.map((a) => <option key={a.id} value={a.id} disabled={a.status === "rejected"}>{a.line1}, {a.city} — {ADDRESS_STATUS_LABEL[a.status]}</option>)}
              </select>
            )}
          </Field>
        )}
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
