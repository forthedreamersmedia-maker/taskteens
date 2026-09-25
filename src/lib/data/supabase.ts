"use client";
/**
 * Production data client — Supabase Auth, Postgres (with RLS), Storage and Realtime.
 * Writes that must trigger email go through Next.js API routes (see src/app/api).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getBrowserSupabase } from "../supabase/client";
import type {
  Application,
  ApplicationWithJob,
  Job,
  JobWithEmployer,
  Session,
  UserRow,
  PlatformSettings,
  TeenProfile,
  EmployerRatingSummary,
  EmployerReview,
  EmployerReviewForEmployer,
  TeenFeedback,
} from "../types";
import { DataError, type DataClient, type InterviewWithContext } from "./types";
import { matchesFilters, sortJobs } from "./filters";
import { DEFAULT_SETTINGS } from "../constants";
import { SITE_URL } from "../config";

const EMPLOYER_COLS = "employer:employer_profiles(user_id,display_name,employer_type,verification_status,city,website,description)";
const JOB_SELECT = `*, ${EMPLOYER_COLS}`;
const APP_SELECT = "*, job:jobs(id,title,city,neighborhood,category,image_url,pay_min,pay_max,pay_type,status,opportunity_type), employer:employer_profiles(display_name)";

type Raw = Record<string, unknown>;

function toJob(r: Raw): JobWithEmployer {
  const j = r as unknown as JobWithEmployer & { search?: unknown };
  delete j.search;
  return { ...j, pay_min: Number(j.pay_min), pay_max: j.pay_max == null ? null : Number(j.pay_max) };
}
function toApp(r: Raw): ApplicationWithJob {
  const a = r as unknown as ApplicationWithJob & { employer?: { display_name: string } };
  return {
    ...a,
    job: a.job ? { ...a.job, pay_min: Number(a.job.pay_min), pay_max: a.job.pay_max == null ? null : Number(a.job.pay_max) } : (a.job as ApplicationWithJob["job"]),
    employer_name: a.employer?.display_name ?? "Employer",
  };
}

function fail(error: { message: string; code?: string } | null, fallback = "Something went wrong."): never {
  throw new DataError(error?.code ?? "db", error?.message ?? fallback);
}

async function api<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new DataError(json.code ?? String(res.status), json.error ?? "Request failed.");
    (err as DataError & { fields?: Record<string, string> }).fields = json.fields;
    throw err;
  }
  return json as T;
}

export function createSupabaseClient(): DataClient {
  const sb: SupabaseClient = getBrowserSupabase();

  async function uidOrThrow(): Promise<string> {
    const { data } = await sb.auth.getUser();
    if (!data.user) throw new DataError("unauthenticated", "Please sign in to continue.");
    return data.user.id;
  }

  async function loadSession(): Promise<Session | null> {
    const { data } = await sb.auth.getUser();
    if (!data.user) return null;
    const { data: row } = await sb.from("users").select("*").eq("id", data.user.id).maybeSingle();
    if (!row || row.status === "suspended") return null;
    return { user: row as UserRow };
  }

  async function interviewsWithCtx(rows: Raw[]): Promise<InterviewWithContext[]> {
    return rows.map((r) => {
      const x = r as Raw & { job?: { title: string }; employer?: { display_name: string }; application?: { applicant_name: string } };
      return {
        ...(r as unknown as InterviewWithContext),
        job_title: x.job?.title ?? "Job",
        employer_name: x.employer?.display_name ?? "Employer",
        applicant_name: x.application?.applicant_name ?? "Applicant",
      };
    });
  }
  const INTERVIEW_SELECT = "*, job:jobs(title), employer:employer_profiles(display_name), application:applications(applicant_name)";

  const client: DataClient = {
    mode: "supabase",

    // ------------------------------------------------------------------ auth
    getSession: loadSession,
    onAuthChange(cb) {
      const { data } = sb.auth.onAuthStateChange(() => {
        loadSession().then(cb);
      });
      return () => data.subscription.unsubscribe();
    },
    async signUp(input) {
      const { data, error } = await sb.auth.signUp({
        email: input.email,
        password: input.password,
        // role is read by the handle_new_user trigger, which only accepts teen|employer
        options: {
          data: { full_name: input.full_name, role: input.role },
          emailRedirectTo: `${SITE_URL}/auth/callback?next=/dashboard`,
          captchaToken: input.captchaToken ?? undefined,
        },
      });
      if (error) {
        if (/captcha/i.test(error.message)) throw new DataError("captcha", "The security check didn't go through. Please try it again.");
        fail(error);
      }
      return { needsEmailVerification: !data.session };
    },
    async signIn(email, password, captchaToken) {
      const { error } = await sb.auth.signInWithPassword({ email, password, options: { captchaToken: captchaToken ?? undefined } });
      if (error) {
        if (/captcha/i.test(error.message)) throw new DataError("captcha", "The security check didn't go through. Please try it again.");
        if (/confirm/i.test(error.message)) throw new DataError("unverified", "Please confirm your email first — check your inbox for the verification link.");
        throw new DataError("invalid", "That email and password don't match.");
      }
      const s = await loadSession();
      if (!s) {
        await sb.auth.signOut();
        throw new DataError("suspended", "This account is unavailable. Contact TaskTeens support.");
      }
      return s;
    },
    async signOut() {
      await sb.auth.signOut();
    },
    async requestPasswordReset(email, captchaToken) {
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: `${SITE_URL}/auth/callback?next=/auth/reset-password`, captchaToken: captchaToken ?? undefined });
      if (error) {
        if (/captcha/i.test(error.message)) throw new DataError("captcha", "The security check didn't go through. Please try it again.");
        fail(error);
      }
    },
    async updatePassword(password) {
      const { error } = await sb.auth.updateUser({ password });
      if (error) fail(error);
    },
    async resendVerification(email) {
      const { error } = await sb.auth.resend({ type: "signup", email });
      if (error) fail(error);
    },

    // ---------------------------------------------------------------- public
    async getSettings() {
      const { data } = await sb.from("platform_settings").select("*").eq("id", 1).maybeSingle();
      return (data as PlatformSettings) ?? DEFAULT_SETTINGS;
    },
    async listCategories(includeInactive) {
      let q = sb.from("categories").select("*").order("sort");
      if (!includeInactive) q = q.eq("active", true);
      const { data, error } = await q;
      if (error) fail(error);
      return data ?? [];
    },
    async listServiceAreas(includeInactive) {
      let q = sb.from("service_areas").select("*").order("name");
      if (!includeInactive) q = q.eq("active", true);
      const { data, error } = await q;
      if (error) fail(error);
      return data ?? [];
    },
    async searchJobs(filters) {
      let q = sb.from("jobs").select(JOB_SELECT).eq("status", "published").eq("moderation_status", "approved").limit(200);
      if (filters.category) q = q.eq("category", filters.category);
      if (filters.opportunity_type) q = q.eq("opportunity_type", filters.opportunity_type);
      if (filters.city) q = q.eq("city", filters.city);
      if (filters.recurrence) q = q.eq("recurrence", filters.recurrence);
      if (filters.work_mode) q = q.eq("work_mode", filters.work_mode);
      if (filters.pay_type) q = q.eq("pay_type", filters.pay_type);
      if (filters.max_min_age) q = q.lte("min_age", filters.max_min_age);
      if (filters.schedule) q = q.contains("schedule_tags", [filters.schedule]);
      if (filters.posted_within_days) q = q.gte("published_at", new Date(Date.now() - filters.posted_within_days * 86400000).toISOString());
      const { data, error } = await q;
      if (error) fail(error);
      // Keyword, area and pay-range matching run client-side over the (bounded) result set.
      return sortJobs((data ?? []).map(toJob).filter((j) => matchesFilters(j, filters)), filters.sort);
    },
    async getFeaturedJobs(limit = 6) {
      const { data, error } = await sb
        .from("jobs")
        .select(JOB_SELECT)
        .eq("status", "published")
        .eq("moderation_status", "approved")
        .order("featured", { ascending: false })
        .order("published_at", { ascending: false })
        .limit(limit);
      if (error) fail(error);
      return (data ?? []).map(toJob);
    },
    async getJob(id) {
      if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
      const { data, error } = await sb.from("jobs").select(JOB_SELECT).eq("id", id).maybeSingle();
      if (error) fail(error);
      return data ? toJob(data) : null;
    },
    async getSimilarJobs(job, limit = 3) {
      const { data } = await sb
        .from("jobs")
        .select(JOB_SELECT)
        .eq("status", "published")
        .eq("moderation_status", "approved")
        .neq("id", job.id)
        .or(`category.eq.${job.category},city.eq.${job.city}`)
        .limit(limit);
      return (data ?? []).map(toJob);
    },

    // ------------------------------------------------------------------ teen
    async getTeenProfile() {
      const uid = await uidOrThrow();
      const { data, error } = await sb.from("teen_profiles").select("*").eq("user_id", uid).maybeSingle();
      if (error) fail(error);
      return data as TeenProfile | null;
    },
    async updateTeenProfile(patch) {
      const uid = await uidOrThrow();
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { user_id, created_at, updated_at, ...rest } = patch;
      const { data, error } = await sb.from("teen_profiles").update(rest).eq("user_id", uid).select().single();
      if (error) fail(error);
      return data as TeenProfile;
    },
    async uploadResume(file) {
      const uid = await uidOrThrow();
      if (file.size > 5 * 1024 * 1024) throw new DataError("too_large", "Résumé must be under 5 MB.");
      const path = `${uid}/${Date.now()}-${file.name.replace(/[^\w.\-]+/g, "_")}`;
      const { error } = await sb.storage.from("resumes").upload(path, file, { upsert: false, contentType: file.type });
      if (error) fail(error);
      return { path, name: file.name };
    },
    async getResumeUrl(path) {
      const { data } = await sb.storage.from("resumes").createSignedUrl(path, 60 * 10);
      return data?.signedUrl ?? null;
    },
    async listSavedJobIds() {
      const { data: auth } = await sb.auth.getUser();
      if (!auth.user) return [];
      const { data } = await sb.from("saved_jobs").select("job_id").eq("user_id", auth.user.id);
      return (data ?? []).map((r) => r.job_id as string);
    },
    async toggleSavedJob(jobId) {
      const uid = await uidOrThrow();
      const { data: existing } = await sb.from("saved_jobs").select("job_id").eq("user_id", uid).eq("job_id", jobId).maybeSingle();
      if (existing) {
        const { error } = await sb.from("saved_jobs").delete().eq("user_id", uid).eq("job_id", jobId);
        if (error) fail(error);
        return false;
      }
      const { error } = await sb.from("saved_jobs").insert({ user_id: uid, job_id: jobId });
      if (error) fail(error);
      return true;
    },
    async listSavedJobs() {
      const uid = await uidOrThrow();
      const { data, error } = await sb.from("saved_jobs").select(`job:jobs(${JOB_SELECT})`).eq("user_id", uid);
      if (error) fail(error);
      return (data ?? [])
        .map((r) => (r as Raw).job as Raw | null)
        .filter((j): j is Raw => !!j && j.status === "published")
        .map(toJob);
    },
    async getMyApplicationForJob(jobId) {
      const { data: auth } = await sb.auth.getUser();
      if (!auth.user) return null;
      const { data } = await sb.from("applications").select("*").eq("job_id", jobId).eq("teen_id", auth.user.id).neq("status", "withdrawn").maybeSingle();
      return (data as Application) ?? null;
    },
    async submitApplication(input) {
      let resume_path: string | null = null;
      let resume_name: string | null = null;
      if (input.resume_file) {
        const r = await client.uploadResume(input.resume_file);
        resume_path = r.path;
        resume_name = r.name;
      } else {
        const p = await client.getTeenProfile();
        resume_path = p?.resume_path ?? null;
        resume_name = p?.resume_name ?? null;
      }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { resume_file, ...rest } = input;
      const { application } = await api<{ application: Application }>("/api/applications", { ...rest, resume_path, resume_name });
      return application;
    },
    async listMyApplications() {
      const uid = await uidOrThrow();
      const { data, error } = await sb.from("applications").select(APP_SELECT).eq("teen_id", uid).order("created_at", { ascending: false });
      if (error) fail(error);
      return (data ?? []).map(toApp);
    },
    async withdrawApplication(id) {
      const uid = await uidOrThrow();
      const { error } = await sb.from("applications").update({ status: "withdrawn" }).eq("id", id).eq("teen_id", uid);
      if (error) fail(error);
    },
    async listMyInterviews() {
      const uid = await uidOrThrow();
      const { data, error } = await sb.from("interview_requests").select(INTERVIEW_SELECT).eq("teen_id", uid).order("created_at", { ascending: false });
      if (error) fail(error);
      return interviewsWithCtx(data ?? []);
    },
    async respondToInterview(id, accept, time) {
      const { data: row } = await sb.from("interview_requests").select("proposed_times").eq("id", id).single();
      const { error } = await sb
        .from("interview_requests")
        .update({ status: accept ? "accepted" : "declined", confirmed_time: accept ? time ?? row?.proposed_times?.[0] : null })
        .eq("id", id);
      if (error) fail(error);
    },
    async getRecommendedJobs(limit = 4) {
      const profile = await client.getTeenProfile();
      const apps = await client.listMyApplications();
      const applied = new Set(apps.map((a) => a.job_id));
      const ageMax = profile?.age_range === "14-15" ? 15 : profile?.age_range === "16-17" ? 17 : 19;
      const jobs = await client.searchJobs({ max_min_age: ageMax });
      const skills = (profile?.skills ?? []).map((s) => s.toLowerCase());
      return jobs
        .filter((j) => !applied.has(j.id))
        .map((j) => {
          let score = 0;
          if (profile?.city && j.city === profile.city) score += 3;
          const text = (j.title + " " + j.required_skills.join(" ") + " " + j.category).toLowerCase();
          skills.forEach((s) => text.includes(s.split(" ")[0]!) && (score += 2));
          if (j.featured) score += 1;
          return { j, score };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map((x) => x.j);
    },

    // --------------------------------------------------------- notifications
    async listNotifications() {
      const { data: auth } = await sb.auth.getUser();
      if (!auth.user) return [];
      const { data } = await sb.from("notifications").select("*").eq("user_id", auth.user.id).order("created_at", { ascending: false }).limit(50);
      return data ?? [];
    },
    async markNotificationRead(id) {
      await sb.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
    },
    async markAllNotificationsRead() {
      const uid = await uidOrThrow();
      await sb.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", uid).is("read_at", null);
    },
    subscribeNotifications(cb) {
      let channel: ReturnType<SupabaseClient["channel"]> | null = null;
      sb.auth.getUser().then(({ data }) => {
        if (!data.user) return;
        channel = sb
          .channel(`notif-${data.user.id}`)
          .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${data.user.id}` }, () => cb())
          .on("postgres_changes", { event: "*", schema: "public", table: "applications" }, () => cb())
          .subscribe();
      });
      return () => {
        if (channel) sb.removeChannel(channel);
      };
    },

    // --------------------------------------------------------------- employer
    async getEmployerProfile() {
      const uid = await uidOrThrow();
      const { data } = await sb.from("employer_profiles").select("*").eq("user_id", uid).maybeSingle();
      return data ?? null;
    },
    async saveEmployerOnboarding(input) {
      const uid = await uidOrThrow();
      const profile = {
        user_id: uid,
        employer_type: input.employer_type,
        display_name: input.display_name,
        city: input.city,
        service_area: input.service_area,
        website: input.website || null,
        description: input.description,
        agreed_to_rules_at: new Date().toISOString(),
        onboarded: true,
      };
      const { data, error } = await sb.from("employer_profiles").upsert(profile).select().single();
      if (error) fail(error);
      await sb.from("users").update({ phone: input.phone }).eq("id", uid);
      if (input.request_verification && !["verified", "pending"].includes(data.verification_status)) {
        const { error: vErr } = await sb.from("verification_requests").insert({
          employer_id: uid,
          employer_type: input.employer_type,
          submitted_info: { legal_name: input.legal_name, business_registration: input.business_registration || null, website: input.website || null, notes: input.verification_notes || null },
        });
        if (vErr && vErr.code !== "23505") fail(vErr);
        const { data: fresh } = await sb.from("employer_profiles").select("*").eq("user_id", uid).single();
        return fresh;
      }
      return data;
    },
    async getMyVerificationRequest() {
      const uid = await uidOrThrow();
      const { data } = await sb.from("verification_requests").select("*").eq("employer_id", uid).order("created_at", { ascending: false }).limit(1).maybeSingle();
      return data ?? null;
    },
    async listMyJobs() {
      const uid = await uidOrThrow();
      const { data, error } = await sb.from("jobs").select("*").eq("employer_id", uid).neq("status", "removed").order("updated_at", { ascending: false });
      if (error) fail(error);
      return (data ?? []).map((r) => toJob(r) as Job);
    },
    async getMyJob(id) {
      const { data } = await sb.from("jobs").select("*").eq("id", id).maybeSingle();
      return data ? (toJob(data) as Job) : null;
    },
    async createJob(input) {
      const uid = await uidOrThrow();
      const { image_file, ...rest } = input;
      const image_url = image_file ? await client.uploadJobImage(image_file) : input.image_url ?? null;
      const { data, error } = await sb.from("jobs").insert({ ...rest, image_url, employer_id: uid }).select().single();
      if (error) fail(error);
      return toJob(data) as Job;
    },
    async updateJob(id, input) {
      const { image_file, ...rest } = input;
      const patch: Raw = { ...rest };
      if (image_file) patch.image_url = await client.uploadJobImage(image_file);
      const { data, error } = await sb.from("jobs").update(patch).eq("id", id).select().single();
      if (error) fail(error);
      return toJob(data) as Job;
    },
    async setJobStatus(id, status) {
      const { error } = await sb.from("jobs").update({ status }).eq("id", id);
      if (error) fail(error);
    },
    async deleteJob(id) {
      const { error } = await sb.from("jobs").delete().eq("id", id);
      if (error) {
        if (error.code === "23503") {
          await sb.from("jobs").update({ status: "closed" }).eq("id", id);
          throw new DataError("has_applications", "This listing has applications, so it was closed instead of deleted to keep applicant records.");
        }
        fail(error);
      }
    },
    async uploadJobImage(file) {
      const uid = await uidOrThrow();
      if (!file.type.startsWith("image/")) throw new DataError("type", "Please upload a JPG, PNG or WebP image.");
      if (file.size > 5 * 1024 * 1024) throw new DataError("too_large", "Images must be under 5 MB.");
      const path = `${uid}/${Date.now()}-${file.name.replace(/[^\w.\-]+/g, "_")}`;
      const { error } = await sb.storage.from("job-images").upload(path, file, { contentType: file.type });
      if (error) fail(error);
      return sb.storage.from("job-images").getPublicUrl(path).data.publicUrl;
    },
    async getEmployerStats() {
      const uid = await uidOrThrow();
      const [{ data: jobs }, { data: apps }, { data: ints }] = await Promise.all([
        sb.from("jobs").select("status").eq("employer_id", uid),
        sb.from("applications").select("status").eq("employer_id", uid),
        sb.from("interview_requests").select("status").eq("employer_id", uid).in("status", ["proposed", "accepted"]),
      ]);
      const js = jobs ?? [];
      const as = apps ?? [];
      return {
        active: js.filter((j) => j.status === "published").length,
        drafts: js.filter((j) => j.status === "draft").length,
        closed: js.filter((j) => j.status === "closed").length,
        paused: js.filter((j) => j.status === "paused").length,
        totalApplications: as.length,
        newApplications: as.filter((a) => a.status === "submitted").length,
        interviews: (ints ?? []).length,
      };
    },
    async listEmployerApplications(jobId) {
      const uid = await uidOrThrow();
      let q = sb.from("applications").select(APP_SELECT).eq("employer_id", uid).order("created_at", { ascending: false });
      if (jobId) q = q.eq("job_id", jobId);
      const { data, error } = await q;
      if (error) fail(error);
      return (data ?? []).map(toApp);
    },
    async getEmployerApplication(id) {
      const uid = await uidOrThrow();
      const { data } = await sb.from("applications").select(APP_SELECT).eq("id", id).eq("employer_id", uid).maybeSingle();
      return data ? toApp(data) : null;
    },
    async markApplicationViewed(id) {
      const { data } = await sb.from("applications").select("status").eq("id", id).single();
      if (data?.status === "submitted") await client.updateApplicationStatus(id, "viewed");
    },
    async updateApplicationStatus(id, status, message) {
      await api(`/api/applications/${id}/status`, { status, message });
    },
    async listApplicationNotes(applicationId) {
      const { data } = await sb.from("application_notes").select("*").eq("application_id", applicationId).order("created_at");
      return data ?? [];
    },
    async addApplicationNote(applicationId, body) {
      const uid = await uidOrThrow();
      const { data, error } = await sb.from("application_notes").insert({ application_id: applicationId, employer_id: uid, body }).select().single();
      if (error) fail(error);
      return data;
    },
    async requestInterview(applicationId, input) {
      const uid = await uidOrThrow();
      const { data, error } = await sb
        .from("interview_requests")
        .insert({
          application_id: applicationId,
          employer_id: uid,
          job_id: "00000000-0000-0000-0000-000000000000", // replaced by trigger
          teen_id: uid, // replaced by trigger
          proposed_times: input.proposed_times,
          format: input.format,
          location_note: input.location_note || null,
          message: input.message || null,
          guardian_invited: input.guardian_invited,
        })
        .select()
        .single();
      if (error) fail(error);
      await client.updateApplicationStatus(applicationId, "interview_requested", input.message);
      return data;
    },
    async listEmployerInterviews() {
      const uid = await uidOrThrow();
      const { data, error } = await sb.from("interview_requests").select(INTERVIEW_SELECT).eq("employer_id", uid).order("created_at", { ascending: false });
      if (error) fail(error);
      return interviewsWithCtx(data ?? []);
    },

    // ------------------------------------------------- completion & ratings
    async markApplicationCompleted(applicationId) {
      const { error } = await sb.rpc("mark_application_completed", { p_application: applicationId });
      if (error) fail(error);
    },
    async getEmployerRatings(employerIds) {
      const ids = [...new Set(employerIds)].filter(Boolean);
      if (!ids.length) return {};
      const { data, error } = await sb.rpc("employer_rating_summaries", { p_employers: ids });
      if (error) fail(error);
      const out: Record<string, EmployerRatingSummary> = {};
      for (const r of (data ?? []) as Raw[]) {
        const n = (v: unknown) => (v == null ? null : Number(v));
        out[String(r.employer_id)] = {
          employer_id: String(r.employer_id), completed_jobs: Number(r.completed_jobs), review_count: Number(r.review_count),
          avg_stars: n(r.avg_stars), pct_paid: n(r.pct_paid), pct_matched: n(r.pct_matched), pct_respectful: n(r.pct_respectful), pct_safe: n(r.pct_safe),
          reliable: Boolean(r.reliable),
        };
      }
      return out;
    },
    async getMyReviewForApplication(applicationId) {
      const { data, error } = await sb.from("employer_reviews").select("*").eq("application_id", applicationId).maybeSingle();
      if (error) fail(error);
      return (data as EmployerReview) ?? null;
    },
    async submitEmployerReview(applicationId, input) {
      const { error } = await sb.rpc("submit_employer_review", {
        p_application: applicationId, p_stars: input.stars, p_paid: input.paid_as_promised ?? null, p_matched: input.matched_listing,
        p_safe: input.felt_safe, p_respectful: input.respectful, p_note: input.private_note ?? null,
      });
      if (error) fail(error);
    },
    async listMyEmployerReviews() {
      const { data, error } = await sb.rpc("my_employer_reviews");
      if (error) fail(error);
      return (data ?? []) as EmployerReviewForEmployer[];
    },
    async getMyTeenFeedback(applicationId) {
      const { data, error } = await sb.from("teen_feedback").select("*").eq("application_id", applicationId).maybeSingle();
      if (error) fail(error);
      return (data as TeenFeedback) ?? null;
    },
    async submitTeenFeedback(applicationId, input) {
      const { error } = await sb.rpc("submit_teen_feedback", {
        p_application: applicationId, p_showed_up: input.showed_up, p_communicated: input.communicated, p_completed: input.completed_job, p_note: input.note ?? null,
      });
      if (error) fail(error);
    },

    // ----------------------------------------------------------------- safety
    async createReport(input) {
      const { id } = await api<{ id: string }>("/api/reports", input);
      return { id, reporter_id: null, ...input, status: "open", resolution_note: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    },
    async blockUser(userId) {
      const uid = await uidOrThrow();
      const { error } = await sb.from("blocks").upsert({ blocker_id: uid, blocked_id: userId });
      if (error) fail(error);
    },
    async unblockUser(userId) {
      const uid = await uidOrThrow();
      await sb.from("blocks").delete().eq("blocker_id", uid).eq("blocked_id", userId);
    },
    async listBlockedUserIds() {
      const { data: auth } = await sb.auth.getUser();
      if (!auth.user) return [];
      const { data } = await sb.from("blocks").select("blocked_id").eq("blocker_id", auth.user.id);
      return (data ?? []).map((b) => b.blocked_id as string);
    },

    // ---------------------------------------------------------------- account
    async updateAccount(patch) {
      const uid = await uidOrThrow();
      const { data, error } = await sb.from("users").update(patch).eq("id", uid).select().single();
      if (error) fail(error);
      return data as UserRow;
    },
    async deleteAccountRequest() {
      const s = await loadSession();
      await client.createReport({ target_type: "user", target_id: s?.user.id ?? null, reason: "Account deletion request", details: "User requested account and data deletion from settings.", severity: "normal", contact_email: s?.user.email ?? null });
    },

    // ------------------------------------------------------------------ admin
    async adminStats() {
      const { data, error } = await sb.rpc("admin_stats");
      if (error) fail(error);
      return data;
    },
    async adminListVerificationRequests() {
      const { data, error } = await sb.from("verification_requests").select("*, employer:employer_profiles(display_name)").order("created_at", { ascending: false });
      if (error) fail(error);
      return (data ?? []).map((v) => ({ ...v, employer_name: (v as Raw & { employer?: { display_name: string } }).employer?.display_name ?? "Unknown" }));
    },
    async adminReviewVerification(id, approve, note) {
      const { error } = await sb.rpc("admin_review_verification", { p_request: id, p_approve: approve, p_note: note });
      if (error) fail(error);
    },
    async adminListJobs(filter) {
      let q = sb.from("jobs").select(JOB_SELECT).order("created_at", { ascending: false }).limit(300);
      if (filter?.moderation) q = q.eq("moderation_status", filter.moderation);
      if (filter?.status) q = q.eq("status", filter.status);
      if (filter?.q) q = q.ilike("title", `%${filter.q}%`);
      const { data, error } = await q;
      if (error) fail(error);
      return (data ?? []).map(toJob);
    },
    async adminModerateJob(id, action, note) {
      const { error } = await sb.rpc("admin_moderate_job", { p_job: id, p_action: action, p_note: note });
      if (error) fail(error);
    },
    async adminListReports() {
      const { data, error } = await sb.from("reports").select("*").order("created_at", { ascending: false });
      if (error) fail(error);
      const order = { emergency: 0, urgent: 1, normal: 2 } as const;
      return (data ?? []).sort((a, b) => order[a.severity as keyof typeof order] - order[b.severity as keyof typeof order]);
    },
    async adminUpdateReport(id, status, note) {
      const { error } = await sb.rpc("admin_update_report", { p_report: id, p_status: status, p_note: note });
      if (error) fail(error);
    },
    async adminListUsers(q) {
      let query = sb.from("users").select("*").order("created_at", { ascending: false }).limit(200);
      if (q) query = query.or(`email.ilike.%${q}%,full_name.ilike.%${q}%`);
      const { data, error } = await query;
      if (error) fail(error);
      return data ?? [];
    },
    async adminSetUserStatus(id, status, note) {
      const { error } = await sb.rpc("admin_set_user_status", { p_user: id, p_status: status, p_note: note });
      if (error) fail(error);
    },
    async adminUpsertCategory(cat) {
      const { error } = await sb.from("categories").upsert(cat);
      if (error) fail(error);
    },
    async adminUpsertServiceArea(area) {
      const { error } = await sb.from("service_areas").upsert(area);
      if (error) fail(error);
    },
    async adminUpdateSettings(patch) {
      const { error } = await sb.from("platform_settings").update(patch).eq("id", 1);
      if (error) fail(error);
    },
    async adminListAuditLogs() {
      const { data, error } = await sb.from("admin_audit_logs").select("*").order("created_at", { ascending: false }).limit(200);
      if (error) fail(error);
      return data ?? [];
    },
    async adminRecentActivity() {
      const [apps, jobs, users, reports] = await Promise.all([
        sb.from("applications").select("applicant_name, created_at, job:jobs(title)").order("created_at", { ascending: false }).limit(10),
        sb.from("jobs").select("title, created_at").order("created_at", { ascending: false }).limit(10),
        sb.from("users").select("full_name, role, created_at").order("created_at", { ascending: false }).limit(10),
        sb.from("reports").select("reason, severity, created_at").order("created_at", { ascending: false }).limit(10),
      ]);
      const items = [
        ...(apps.data ?? []).map((a) => ({ kind: "application", label: `${a.applicant_name} applied to ${(a.job as unknown as { title: string } | null)?.title ?? "a job"}`, at: a.created_at as string })),
        ...(jobs.data ?? []).map((j) => ({ kind: "job", label: `Listing created: ${j.title}`, at: j.created_at as string })),
        ...(users.data ?? []).map((u) => ({ kind: "user", label: `${u.role} account created: ${u.full_name}`, at: u.created_at as string })),
        ...(reports.data ?? []).map((r) => ({ kind: "report", label: `Report (${r.severity}): ${r.reason}`, at: r.created_at as string })),
      ];
      return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 25);
    },
    async adminAddNote(targetType, targetId, note) {
      const { error } = await sb.rpc("admin_add_note", { p_target_type: targetType, p_target_id: targetId, p_note: note });
      if (error) fail(error);
    },
    async adminListReviews() {
      const { data, error } = await sb
        .from("employer_reviews")
        .select("*, job:jobs(title), employer:employer_profiles(display_name), teen:users!employer_reviews_teen_id_fkey(full_name)")
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) fail(error);
      return ((data ?? []) as Raw[]).map((r) => {
        const x = r as Raw & { job?: { title: string }; employer?: { display_name: string }; teen?: { full_name: string } };
        const { job, employer, teen, ...rest } = x;
        return { ...(rest as unknown as EmployerReview), job_title: job?.title ?? "Job", employer_name: employer?.display_name ?? "Employer", teen_name: teen?.full_name ?? "Teen" };
      });
    },
    async adminSetReviewStatus(id, status, note) {
      const { error } = await sb.rpc("admin_set_review_status", { p_review: id, p_status: status, p_note: note });
      if (error) fail(error);
    },
    async adminListTeenFeedback() {
      const { data, error } = await sb
        .from("teen_feedback")
        .select("*, job:jobs(title), employer:employer_profiles(display_name), teen:users!teen_feedback_teen_id_fkey(full_name)")
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) fail(error);
      return ((data ?? []) as Raw[]).map((r) => {
        const x = r as Raw & { job?: { title: string }; employer?: { display_name: string }; teen?: { full_name: string } };
        const { job, employer, teen, ...rest } = x;
        return { ...(rest as unknown as TeenFeedback), job_title: job?.title ?? "Job", employer_name: employer?.display_name ?? "Employer", teen_name: teen?.full_name ?? "Teen" };
      });
    },
  };
  return client;
}
