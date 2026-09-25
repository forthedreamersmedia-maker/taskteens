"use client";
/**
 * LOCAL DEMONSTRATION MODE data client.
 * Everything lives in this browser's localStorage. It mirrors the Supabase rules
 * (ownership checks, role checks, duplicate prevention, notification side-effects)
 * so the UI behaves the same way it will in production. NOT SECURE — demo only.
 */
import type {
  Application,
  ApplicationWithJob,
  EmployerProfile,
  Job,
  JobWithEmployer,
  Notification,
  Session,
  TeenProfile,
  UserRow,
  EmailLogEntry,
  NotificationKind,
} from "../types";
import { buildSeed, DEMO_DB_VERSION, type DemoDB } from "./seed";
import { DataError, type DataClient, type InterviewWithContext } from "./types";
import { matchesFilters, sortJobs } from "./filters";
import { uid } from "../utils";
import { employerNewApplicationEmail, statusUpdateEmail, teenConfirmationEmail, safetyReportEmail, type EmailMessage } from "../email/templates";
import { APPLICATION_STATUS_LABEL, SAFETY_EMAIL } from "../constants";
import { summarizeEmployer } from "../ratings";

const DB_KEY = "taskteens-demo-db";
const SESSION_KEY = "taskteens-demo-session";
const FILES_KEY = "taskteens-demo-files";

const now = () => new Date().toISOString();
const wait = (ms = 120) => new Promise((r) => setTimeout(r, ms));
const hasWindow = () => typeof window !== "undefined";

let memoryDb: DemoDB | null = null;
const listeners = new Set<() => void>();
const authListeners = new Set<(s: Session | null) => void>();

function load(): DemoDB {
  if (!hasWindow()) return (memoryDb ??= buildSeed());
  if (memoryDb) return memoryDb;
  try {
    const raw = window.localStorage.getItem(DB_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DemoDB;
      if (parsed.version === DEMO_DB_VERSION) return (memoryDb = parsed);
    }
  } catch {
    /* storage blocked or corrupt — fall back to fresh seed */
  }
  memoryDb = buildSeed();
  persist();
  return memoryDb;
}

function persist() {
  if (!hasWindow() || !memoryDb) return;
  try {
    window.localStorage.setItem(DB_KEY, JSON.stringify(memoryDb));
  } catch {
    /* quota — keep in memory */
  }
  listeners.forEach((l) => l());
}

if (hasWindow()) {
  // Keep multiple tabs in sync (e.g. teen in one tab, employer in another).
  window.addEventListener("storage", (e) => {
    if (e.key === DB_KEY) {
      memoryDb = null;
      load();
      listeners.forEach((l) => l());
    }
    if (e.key === SESSION_KEY) {
      const s = currentSession();
      authListeners.forEach((l) => l(s));
    }
  });
}

function stripPassword(u: DemoDB["users"][number]): UserRow {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { password, email_verified, ...rest } = u;
  return rest;
}

function currentSession(): Session | null {
  if (!hasWindow()) return null;
  let id: string | null = null;
  try {
    id = window.localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
  if (!id) return null;
  const u = load().users.find((x) => x.id === id);
  if (!u || u.status === "suspended") return null;
  return { user: stripPassword(u) };
}

function setSession(id: string | null) {
  try {
    if (id) window.localStorage.setItem(SESSION_KEY, id);
    else window.localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
  const s = currentSession();
  authListeners.forEach((l) => l(s));
}

function requireUser(role?: UserRow["role"] | UserRow["role"][]): UserRow {
  const s = currentSession();
  if (!s) throw new DataError("unauthenticated", "Please sign in to continue.");
  const roles = role ? (Array.isArray(role) ? role : [role]) : null;
  if (roles && !roles.includes(s.user.role)) throw new DataError("forbidden", "You don't have access to that.");
  return s.user;
}

function withEmployer(db: DemoDB, job: Job): JobWithEmployer {
  const e = db.employer_profiles.find((p) => p.user_id === job.employer_id);
  return {
    ...job,
    employer: {
      user_id: job.employer_id,
      display_name: e?.display_name ?? "Local employer",
      employer_type: e?.employer_type ?? "individual",
      verification_status: e?.verification_status ?? "unverified",
      city: e?.city ?? job.city,
      website: e?.website ?? null,
      description: e?.description ?? null,
    },
  };
}

const isPublic = (j: Job) => j.status === "published" && j.moderation_status === "approved";

function employerIsActive(db: DemoDB, employerId: string) {
  return db.users.find((u) => u.id === employerId)?.status !== "suspended";
}

function withJob(db: DemoDB, a: Application): ApplicationWithJob {
  const j = db.jobs.find((x) => x.id === a.job_id);
  const e = db.employer_profiles.find((x) => x.user_id === a.employer_id);
  return {
    ...a,
    job: {
      id: a.job_id,
      title: j?.title ?? "Removed listing",
      city: j?.city ?? "",
      neighborhood: j?.neighborhood ?? null,
      category: j?.category ?? "",
      image_url: j?.image_url ?? null,
      pay_min: j?.pay_min ?? 0,
      pay_max: j?.pay_max ?? null,
      pay_type: j?.pay_type ?? "hourly",
      status: j?.status ?? "removed",
    },
    employer_name: e?.display_name ?? "Employer",
  };
}

function pushNotification(db: DemoDB, user_id: string, kind: NotificationKind, title: string, body: string, link: string | null) {
  const n: Notification = { id: uid("n"), user_id, kind, title, body, link, read_at: null, created_at: now() };
  db.notifications.unshift(n);
}

function sendDemoEmail(db: DemoDB, msg: EmailMessage) {
  const entry: EmailLogEntry = { id: uid("mail"), to: msg.to, subject: msg.subject, text: msg.text, created_at: now(), delivered: "demo_outbox" };
  db.outbox.unshift(entry);
}

function audit(db: DemoDB, admin_id: string, action: string, target_type: string, target_id: string | null, note: string | null, metadata: Record<string, unknown> = {}) {
  db.admin_audit_logs.unshift({ id: uid("log"), admin_id, action, target_type, target_id, note: note || null, metadata, created_at: now() });
}

const site = () => (hasWindow() ? window.location.origin : "http://localhost:3000");
const firstName = (n: string) => n.split(" ")[0] ?? n;

function readFiles(): Record<string, string> {
  try {
    return JSON.parse(window.localStorage.getItem(FILES_KEY) ?? "{}");
  } catch {
    return {};
  }
}
async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new DataError("upload", "Could not read that file."));
    r.readAsDataURL(file);
  });
}

function emptyTeenProfile(u: UserRow): TeenProfile {
  return {
    user_id: u.id, display_name: u.full_name, age_range: null, city: null, bio: null, skills: [], experience: null, availability: {},
    transportation: null, resume_path: null, resume_name: null, portfolio_url: null, work_permit_status: null, guardian_consent_status: null,
    email_notifications: true, created_at: now(), updated_at: now(),
  };
}

export function createMockClient(): DataClient {
  return {
    mode: "demo",

    // ------------------------------------------------------------------ auth
    async getSession() {
      return currentSession();
    },
    onAuthChange(cb) {
      authListeners.add(cb);
      return () => authListeners.delete(cb);
    },
    async signUp(input) {
      await wait();
      const db = load();
      const email = input.email.trim().toLowerCase();
      if (db.users.some((u) => u.email === email)) throw new DataError("exists", "An account with that email already exists. Try signing in.");
      // Role is limited to teen|employer here and in the Supabase trigger. Admins can't be self-created.
      const role = input.role === "employer" ? "employer" : "teen";
      const id = uid("u");
      db.users.push({ id, email, full_name: input.full_name.trim(), role, status: "active", phone: null, created_at: now(), password: input.password, email_verified: true });
      if (role === "teen") db.teen_profiles.push(emptyTeenProfile({ id, email, full_name: input.full_name, role, status: "active", phone: null, created_at: now() }));
      pushNotification(db, id, "system", "Welcome to TaskTeens", role === "teen" ? "Complete your profile so employers can learn about you." : "Finish setting up your employer profile to post your first job.", role === "teen" ? "/dashboard/teen/profile" : "/onboarding/employer");
      sendDemoEmail(db, { to: email, subject: "Confirm your TaskTeens email", text: "In production, Supabase sends a verification link here. Demo mode auto-verifies accounts.", html: "" });
      persist();
      setSession(id);
      return { needsEmailVerification: false };
    },
    async signIn(email, password) {
      await wait();
      const u = load().users.find((x) => x.email === email.trim().toLowerCase());
      if (!u || u.password !== password) throw new DataError("invalid", "That email and password don't match. Demo accounts use the password demo1234.");
      if (u.status === "suspended") throw new DataError("suspended", "This account is suspended. Contact TaskTeens support.");
      setSession(u.id);
      return { user: stripPassword(u) };
    },
    async signOut() {
      setSession(null);
    },
    async requestPasswordReset(email) {
      await wait();
      const db = load();
      if (db.users.some((u) => u.email === email.trim().toLowerCase())) {
        sendDemoEmail(db, { to: email, subject: "Reset your TaskTeens password", text: `Demo mode: open ${site()}/auth/reset-password to choose a new password.`, html: "" });
        persist();
      }
    },
    async updatePassword(password) {
      const me = requireUser();
      const db = load();
      const u = db.users.find((x) => x.id === me.id)!;
      u.password = password;
      persist();
    },
    async resendVerification() {
      await wait();
    },

    // ---------------------------------------------------------------- public
    async getSettings() {
      return { ...load().settings };
    },
    async listCategories(includeInactive) {
      return load().categories.filter((c) => includeInactive || c.active).sort((a, b) => a.sort - b.sort);
    },
    async listServiceAreas(includeInactive) {
      return load().service_areas.filter((a) => includeInactive || a.active);
    },
    async searchJobs(filters) {
      await wait(200);
      const db = load();
      const list = db.jobs.filter((j) => isPublic(j) && employerIsActive(db, j.employer_id)).map((j) => withEmployer(db, j));
      return sortJobs(list.filter((j) => matchesFilters(j, filters)), filters.sort);
    },
    async getFeaturedJobs(limit = 6) {
      await wait(150);
      const db = load();
      const pub = db.jobs.filter((j) => isPublic(j) && employerIsActive(db, j.employer_id));
      const featured = pub.filter((j) => j.featured);
      const rest = pub.filter((j) => !j.featured);
      return [...featured, ...rest].slice(0, limit).map((j) => withEmployer(db, j));
    },
    async getJob(id) {
      await wait(120);
      const db = load();
      const j = db.jobs.find((x) => x.id === id);
      if (!j) return null;
      const s = currentSession();
      const canSee = isPublic(j) || (s && (s.user.id === j.employer_id || s.user.role === "admin"));
      return canSee ? withEmployer(db, j) : null;
    },
    async getSimilarJobs(job, limit = 3) {
      const db = load();
      return db.jobs
        .filter((j) => isPublic(j) && j.id !== job.id && (j.category === job.category || j.city === job.city))
        .sort((a, b) => Number(b.category === job.category) - Number(a.category === job.category))
        .slice(0, limit)
        .map((j) => withEmployer(db, j));
    },

    // ------------------------------------------------------------------ teen
    async getTeenProfile() {
      const me = requireUser("teen");
      const db = load();
      let p = db.teen_profiles.find((x) => x.user_id === me.id);
      if (!p) {
        p = emptyTeenProfile(me);
        db.teen_profiles.push(p);
        persist();
      }
      return { ...p };
    },
    async updateTeenProfile(patch) {
      await wait();
      const me = requireUser("teen");
      const db = load();
      const p = db.teen_profiles.find((x) => x.user_id === me.id)!;
      Object.assign(p, patch, { user_id: me.id, updated_at: now() });
      persist();
      return { ...p };
    },
    async uploadResume(file) {
      requireUser("teen");
      if (file.size > 5 * 1024 * 1024) throw new DataError("too_large", "Résumé must be under 5 MB.");
      const path = `demo://resumes/${uid()}-${file.name}`;
      if (file.size < 900 * 1024) {
        try {
          const files = readFiles();
          files[path] = await fileToDataUrl(file);
          window.localStorage.setItem(FILES_KEY, JSON.stringify(files));
        } catch {
          /* too big for storage — keep name only */
        }
      }
      return { path, name: file.name };
    },
    async getResumeUrl(path) {
      return readFiles()[path] ?? null;
    },
    async listSavedJobIds() {
      const s = currentSession();
      if (!s) return [];
      return load().saved_jobs.filter((x) => x.user_id === s.user.id).map((x) => x.job_id);
    },
    async toggleSavedJob(jobId) {
      const me = requireUser("teen");
      const db = load();
      const i = db.saved_jobs.findIndex((x) => x.user_id === me.id && x.job_id === jobId);
      if (i >= 0) db.saved_jobs.splice(i, 1);
      else db.saved_jobs.push({ user_id: me.id, job_id: jobId, created_at: now() });
      persist();
      return i < 0;
    },
    async listSavedJobs() {
      const me = requireUser("teen");
      const db = load();
      const ids = db.saved_jobs.filter((x) => x.user_id === me.id).map((x) => x.job_id);
      return db.jobs.filter((j) => ids.includes(j.id) && isPublic(j)).map((j) => withEmployer(db, j));
    },
    async getMyApplicationForJob(jobId) {
      const s = currentSession();
      if (!s || s.user.role !== "teen") return null;
      return load().applications.find((a) => a.job_id === jobId && a.teen_id === s.user.id && a.status !== "withdrawn") ?? null;
    },
    async submitApplication(input) {
      await wait(400);
      const me = requireUser("teen");
      const db = load();
      const job = db.jobs.find((j) => j.id === input.job_id);
      if (!job || !isPublic(job)) throw new DataError("not_found", "This listing is no longer accepting applications.");
      if (job.deadline && job.deadline < now().slice(0, 10)) throw new DataError("closed", "The application deadline for this job has passed.");
      // Unique (job_id, teen_id) — same constraint as the database.
      const existing = db.applications.find((a) => a.job_id === job.id && a.teen_id === me.id);
      if (existing && existing.status !== "withdrawn") throw new DataError("duplicate", "You've already applied to this job. Check your dashboard for its status.");
      if (db.blocks.some((b) => (b.blocker_id === job.employer_id && b.blocked_id === me.id) || (b.blocker_id === me.id && b.blocked_id === job.employer_id)))
        throw new DataError("blocked", "You can't apply to this listing.");

      let resume_path: string | null = null;
      let resume_name: string | null = null;
      if (input.resume_file) {
        const r = await this.uploadResume(input.resume_file);
        resume_path = r.path;
        resume_name = r.name;
      } else {
        const tp = db.teen_profiles.find((p) => p.user_id === me.id);
        resume_path = tp?.resume_path ?? null;
        resume_name = tp?.resume_name ?? null;
      }
      const app: Application = {
        id: uid("app"),
        job_id: job.id,
        employer_id: job.employer_id,
        teen_id: me.id,
        status: "submitted",
        applicant_name: input.applicant_name.trim(),
        applicant_email: input.applicant_email.trim(),
        applicant_phone: input.applicant_phone.trim(),
        age_range: input.age_range,
        city: input.city.trim(),
        experience: input.experience.trim(),
        skills: input.skills,
        availability: input.availability.trim(),
        transportation: input.transportation,
        interest_statement: input.interest_statement.trim(),
        resume_path,
        resume_name,
        portfolio_url: input.portfolio_url?.trim() || null,
        work_permit_status: input.work_permit_status,
        guardian_consent_status: input.guardian_consent_status,
        agreed_to_safety_rules: input.agreed_to_safety_rules,
        viewed_at: null,
        status_updated_at: now(),
        created_at: now(),
        completed_at: null,
        completed_by: null,
      };
      if (existing) db.applications.splice(db.applications.indexOf(existing), 1); // re-apply after withdrawal
      db.applications.unshift(app);

      const employer = db.employer_profiles.find((e) => e.user_id === job.employer_id);
      const employerUser = db.users.find((u) => u.id === job.employer_id);
      pushNotification(db, job.employer_id, "application_received", "New application", `${app.applicant_name} applied to “${job.title}”.`, `/dashboard/employer/applications/${app.id}`);
      pushNotification(db, me.id, "application_status", "Application sent", `Your application for “${job.title}” was delivered to ${employer?.display_name ?? "the employer"}.`, "/dashboard/teen/applications");
      if (employerUser)
        sendDemoEmail(db, employerNewApplicationEmail({ to: employerUser.email, site: site(), employerName: employer?.display_name ?? employerUser.full_name, jobTitle: job.title, applicantFirstName: firstName(app.applicant_name), applicationId: app.id }));
      sendDemoEmail(db, teenConfirmationEmail({ to: app.applicant_email, site: site(), teenFirstName: firstName(app.applicant_name), jobTitle: job.title, employerName: employer?.display_name ?? "the employer" }));

      // Keep teen profile in sync with what they just told us (helps next application).
      const tp = db.teen_profiles.find((p) => p.user_id === me.id);
      if (tp) {
        tp.age_range ??= app.age_range;
        tp.city ??= app.city;
        if (!tp.skills.length) tp.skills = app.skills;
        tp.experience ??= app.experience;
        if (resume_path && !tp.resume_path) {
          tp.resume_path = resume_path;
          tp.resume_name = resume_name;
        }
      }
      persist();
      return app;
    },
    async listMyApplications() {
      await wait();
      const me = requireUser("teen");
      const db = load();
      return db.applications.filter((a) => a.teen_id === me.id).map((a) => withJob(db, a));
    },
    async withdrawApplication(id) {
      const me = requireUser("teen");
      const db = load();
      const a = db.applications.find((x) => x.id === id && x.teen_id === me.id);
      if (!a) throw new DataError("not_found", "Application not found.");
      if (a.completed_at) throw new DataError("invalid", "This job is already marked completed.");
      a.status = "withdrawn";
      a.status_updated_at = now();
      const job = db.jobs.find((j) => j.id === a.job_id);
      pushNotification(db, a.employer_id, "application_status", "Application withdrawn", `${a.applicant_name} withdrew from “${job?.title}”.`, `/dashboard/employer/applications/${a.id}`);
      persist();
    },
    async listMyInterviews() {
      const me = requireUser("teen");
      const db = load();
      return db.interview_requests.filter((i) => i.teen_id === me.id).map((i) => interviewCtx(db, i));
    },
    async respondToInterview(id, accept, time) {
      const me = requireUser("teen");
      const db = load();
      const i = db.interview_requests.find((x) => x.id === id && x.teen_id === me.id);
      if (!i) throw new DataError("not_found", "Interview not found.");
      i.status = accept ? "accepted" : "declined";
      i.confirmed_time = accept ? (time ?? i.proposed_times[0] ?? null) : null;
      i.updated_at = now();
      const ctx = interviewCtx(db, i);
      pushNotification(db, i.employer_id, "interview_response", accept ? "Interview accepted" : "Interview declined", `${ctx.applicant_name} ${accept ? "accepted" : "declined"} the interview for “${ctx.job_title}”.`, `/dashboard/employer/applications/${i.application_id}`);
      persist();
    },
    async getRecommendedJobs(limit = 4) {
      const me = requireUser("teen");
      const db = load();
      const p = db.teen_profiles.find((x) => x.user_id === me.id);
      const applied = new Set(db.applications.filter((a) => a.teen_id === me.id).map((a) => a.job_id));
      const ageMax = p?.age_range === "14-15" ? 15 : p?.age_range === "16-17" ? 17 : 19;
      const skillWords = (p?.skills ?? []).map((s) => s.toLowerCase());
      return db.jobs
        .filter((j) => isPublic(j) && !applied.has(j.id) && j.min_age <= ageMax)
        .map((j) => {
          let score = 0;
          if (p?.city && j.city === p.city) score += 3;
          const text = (j.title + " " + j.required_skills.join(" ") + " " + j.category).toLowerCase();
          skillWords.forEach((s) => text.includes(s.split(" ")[0]!) && (score += 2));
          if (j.featured) score += 1;
          return { j, score };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(({ j }) => withEmployer(db, j));
    },

    // --------------------------------------------------------- notifications
    async listNotifications() {
      const s = currentSession();
      if (!s) return [];
      return load().notifications.filter((n) => n.user_id === s.user.id).slice(0, 50);
    },
    async markNotificationRead(id) {
      const me = requireUser();
      const n = load().notifications.find((x) => x.id === id && x.user_id === me.id);
      if (n && !n.read_at) {
        n.read_at = now();
        persist();
      }
    },
    async markAllNotificationsRead() {
      const me = requireUser();
      load().notifications.forEach((n) => n.user_id === me.id && !n.read_at && (n.read_at = now()));
      persist();
    },
    subscribeNotifications(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },

    // --------------------------------------------------------------- employer
    async getEmployerProfile() {
      const me = requireUser(["employer", "admin"]);
      return load().employer_profiles.find((p) => p.user_id === me.id) ?? null;
    },
    async saveEmployerOnboarding(input) {
      await wait(300);
      const me = requireUser("employer");
      const db = load();
      let p = db.employer_profiles.find((x) => x.user_id === me.id);
      const base: Omit<EmployerProfile, "verification_status" | "created_at"> = {
        user_id: me.id,
        employer_type: input.employer_type,
        display_name: input.display_name.trim(),
        city: input.city,
        service_area: input.service_area,
        website: input.website.trim() || null,
        description: input.description.trim(),
        logo_url: null,
        agreed_to_rules_at: now(),
        onboarded: true,
        updated_at: now(),
      };
      if (p) Object.assign(p, base);
      else {
        p = { ...base, verification_status: "unverified", created_at: now() };
        db.employer_profiles.push(p);
      }
      const u = db.users.find((x) => x.id === me.id)!;
      u.phone = input.phone.trim();
      if (input.request_verification && p.verification_status !== "verified" && p.verification_status !== "pending") {
        p.verification_status = "pending";
        db.verification_requests.unshift({
          id: uid("ver"), employer_id: me.id, employer_type: input.employer_type,
          submitted_info: { legal_name: input.legal_name, business_registration: input.business_registration || null, website: input.website || null, notes: input.verification_notes || null },
          status: "pending", reviewer_id: null, review_note: null, created_at: now(), reviewed_at: null,
        });
      }
      persist();
      return { ...p };
    },
    async getMyVerificationRequest() {
      const me = requireUser("employer");
      return load().verification_requests.find((v) => v.employer_id === me.id) ?? null;
    },
    async listMyJobs() {
      await wait();
      const me = requireUser("employer");
      return load().jobs.filter((j) => j.employer_id === me.id && j.status !== "removed").sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    },
    async getMyJob(id) {
      const me = requireUser(["employer", "admin"]);
      const j = load().jobs.find((x) => x.id === id);
      return j && (j.employer_id === me.id || me.role === "admin") ? { ...j } : null;
    },
    async createJob(input) {
      await wait(300);
      const me = requireUser("employer");
      const db = load();
      const profile = db.employer_profiles.find((p) => p.user_id === me.id);
      if (!profile?.onboarded) throw new DataError("onboarding", "Finish your employer profile before posting a job.");
      let image_url = input.image_url ?? null;
      if (input.image_file) image_url = await this.uploadJobImage(input.image_file);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { image_file, ...rest } = input;
      const j: Job = {
        ...rest,
        image_url,
        id: uid("job"),
        employer_id: me.id,
        moderation_status: db.settings.require_job_approval ? "pending" : "approved",
        featured: false,
        is_demo: false,
        created_at: now(),
        updated_at: now(),
        published_at: input.status === "published" ? now() : null,
      };
      db.jobs.unshift(j);
      persist();
      return j;
    },
    async updateJob(id, input) {
      await wait(250);
      const me = requireUser("employer");
      const db = load();
      const j = db.jobs.find((x) => x.id === id && x.employer_id === me.id);
      if (!j) throw new DataError("not_found", "Listing not found.");
      let image_url = input.image_url ?? j.image_url;
      if (input.image_file) image_url = await this.uploadJobImage(input.image_file);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { image_file, ...rest } = input;
      const wasPublished = j.status === "published";
      Object.assign(j, rest, { image_url, updated_at: now() });
      if (!wasPublished && j.status === "published") j.published_at ??= now();
      // Substantive edits to a rejected listing send it back to review.
      if (j.moderation_status === "rejected") j.moderation_status = "pending";
      persist();
      return { ...j };
    },
    async setJobStatus(id, status) {
      const me = requireUser("employer");
      const db = load();
      const j = db.jobs.find((x) => x.id === id && x.employer_id === me.id);
      if (!j) throw new DataError("not_found", "Listing not found.");
      if (status === "removed") throw new DataError("forbidden", "Only administrators can remove listings. Use delete instead.");
      j.status = status;
      j.updated_at = now();
      if (status === "published") j.published_at ??= now();
      persist();
    },
    async deleteJob(id) {
      const me = requireUser("employer");
      const db = load();
      const j = db.jobs.find((x) => x.id === id && x.employer_id === me.id);
      if (!j) throw new DataError("not_found", "Listing not found.");
      const hasApps = db.applications.some((a) => a.job_id === id);
      if (hasApps) {
        // Keep applicant records; hide the listing instead of hard-deleting.
        j.status = "closed";
        j.updated_at = now();
        persist();
        throw new DataError("has_applications", "This listing has applications, so it was closed instead of deleted to keep applicant records.");
      }
      db.jobs.splice(db.jobs.indexOf(j), 1);
      persist();
    },
    async uploadJobImage(file) {
      requireUser("employer");
      if (!file.type.startsWith("image/")) throw new DataError("type", "Please upload an image file (JPG, PNG or WebP).");
      if (file.size > 2 * 1024 * 1024) throw new DataError("too_large", "In demo mode, images must be under 2 MB.");
      return fileToDataUrl(file);
    },
    async getEmployerStats() {
      const me = requireUser("employer");
      const db = load();
      const jobs = db.jobs.filter((j) => j.employer_id === me.id);
      const apps = db.applications.filter((a) => a.employer_id === me.id);
      return {
        active: jobs.filter((j) => j.status === "published").length,
        drafts: jobs.filter((j) => j.status === "draft").length,
        closed: jobs.filter((j) => j.status === "closed").length,
        paused: jobs.filter((j) => j.status === "paused").length,
        totalApplications: apps.length,
        newApplications: apps.filter((a) => a.status === "submitted").length,
        interviews: db.interview_requests.filter((i) => i.employer_id === me.id && ["proposed", "accepted"].includes(i.status)).length,
      };
    },
    async listEmployerApplications(jobId) {
      await wait();
      const me = requireUser("employer");
      const db = load();
      return db.applications.filter((a) => a.employer_id === me.id && (!jobId || a.job_id === jobId)).map((a) => withJob(db, a));
    },
    async getEmployerApplication(id) {
      const me = requireUser("employer");
      const db = load();
      const a = db.applications.find((x) => x.id === id && x.employer_id === me.id);
      return a ? withJob(db, a) : null;
    },
    async markApplicationViewed(id) {
      const me = requireUser("employer");
      const db = load();
      const a = db.applications.find((x) => x.id === id && x.employer_id === me.id);
      if (!a || a.status !== "submitted") return;
      await this.updateApplicationStatus(id, "viewed");
    },
    async updateApplicationStatus(id, status, message) {
      await wait(200);
      const me = requireUser("employer");
      const db = load();
      const a = db.applications.find((x) => x.id === id && x.employer_id === me.id);
      if (!a) throw new DataError("not_found", "Application not found.");
      if (a.status === "withdrawn") throw new DataError("withdrawn", "The applicant withdrew this application.");
      if (status === "withdrawn") throw new DataError("forbidden", "Only the applicant can withdraw.");
      if (a.completed_at) throw new DataError("invalid", "This job is already marked completed.");
      a.status = status;
      a.status_updated_at = now();
      if (status !== "submitted") a.viewed_at ??= now();
      const job = db.jobs.find((j) => j.id === a.job_id);
      const employer = db.employer_profiles.find((e) => e.user_id === me.id);
      // Mirrors the Postgres trigger `notify_application_status_change`.
      pushNotification(db, a.teen_id, "application_status", `Status: ${APPLICATION_STATUS_LABEL[status]}`, `${employer?.display_name ?? "The employer"} updated your application for “${job?.title}”.${message ? ` Message: “${message}”` : ""}`, "/dashboard/teen/applications");
      const teen = db.teen_profiles.find((p) => p.user_id === a.teen_id);
      if (status !== "viewed" && teen?.email_notifications !== false)
        sendDemoEmail(db, statusUpdateEmail({ to: a.applicant_email, site: site(), teenFirstName: firstName(a.applicant_name), jobTitle: job?.title ?? "", employerName: employer?.display_name ?? "", status, message }));
      persist();
    },
    async listApplicationNotes(applicationId) {
      const me = requireUser("employer");
      return load().application_notes.filter((n) => n.application_id === applicationId && n.employer_id === me.id);
    },
    async addApplicationNote(applicationId, body) {
      const me = requireUser("employer");
      const db = load();
      if (!db.applications.some((a) => a.id === applicationId && a.employer_id === me.id)) throw new DataError("not_found", "Application not found.");
      const note = { id: uid("note"), application_id: applicationId, employer_id: me.id, body: body.trim(), created_at: now() };
      db.application_notes.push(note);
      persist();
      return note;
    },
    async requestInterview(applicationId, input) {
      await wait(250);
      const me = requireUser("employer");
      const db = load();
      const a = db.applications.find((x) => x.id === applicationId && x.employer_id === me.id);
      if (!a) throw new DataError("not_found", "Application not found.");
      const i = {
        id: uid("int"), application_id: a.id, job_id: a.job_id, employer_id: me.id, teen_id: a.teen_id,
        proposed_times: input.proposed_times, confirmed_time: null, format: input.format, location_note: input.location_note || null,
        message: input.message || null, guardian_invited: input.guardian_invited, status: "proposed" as const, created_at: now(), updated_at: now(),
      };
      db.interview_requests.unshift(i);
      const job = db.jobs.find((j) => j.id === a.job_id);
      const employer = db.employer_profiles.find((e) => e.user_id === me.id);
      pushNotification(db, a.teen_id, "interview_requested", "Interview requested", `${employer?.display_name} would like to interview you for “${job?.title}”. Pick a time in your dashboard.`, "/dashboard/teen/interviews");
      persist();
      await this.updateApplicationStatus(a.id, "interview_requested", input.message);
      return i;
    },
    async listEmployerInterviews() {
      const me = requireUser("employer");
      const db = load();
      return db.interview_requests.filter((i) => i.employer_id === me.id).map((i) => interviewCtx(db, i));
    },

    // ------------------------------------------------- completion & ratings
    async markApplicationCompleted(applicationId) {
      await wait(150);
      const me = requireUser(["teen", "employer"]);
      const db = load();
      const a = db.applications.find((x) => x.id === applicationId && (x.teen_id === me.id || x.employer_id === me.id));
      if (!a) throw new DataError("not_found", "Application not found.");
      if (a.status !== "selected") throw new DataError("invalid", "Only a job you were selected for can be marked completed.");
      if (a.completed_at) return;
      a.completed_at = now();
      a.completed_by = me.id === a.teen_id ? "teen" : "employer";
      const job = db.jobs.find((j) => j.id === a.job_id);
      if (a.completed_by === "teen")
        pushNotification(db, a.employer_id, "application_status", "Job marked completed", `${a.applicant_name} marked “${job?.title}” as completed. You can leave private feedback for TaskTeens.`, `/dashboard/employer/applications/${a.id}`);
      else
        pushNotification(db, a.teen_id, "application_status", "Job marked completed", `“${job?.title}” was marked completed. You can now rate this employer.`, "/dashboard/teen/applications");
      persist();
    },
    async getEmployerRatings(employerIds) {
      const db = load();
      const out: Record<string, ReturnType<typeof summarizeEmployer>> = {};
      for (const id of new Set(employerIds)) {
        const reviews = db.employer_reviews.filter((r) => r.employer_id === id && r.status === "published");
        const completed = db.applications.filter((a) => a.employer_id === id && a.completed_at).length;
        const jobIds = new Set(db.jobs.filter((j) => j.employer_id === id).map((j) => j.id));
        const unresolved = db.reports.some(
          (r) => (r.status === "open" || r.status === "investigating") &&
            ((r.target_type === "job" && r.target_id && jobIds.has(r.target_id)) || (r.target_type === "user" && r.target_id === id)),
        );
        out[id] = summarizeEmployer(id, reviews, completed, unresolved);
      }
      return out;
    },
    async getMyReviewForApplication(applicationId) {
      const me = requireUser("teen");
      return load().employer_reviews.find((r) => r.application_id === applicationId && r.teen_id === me.id) ?? null;
    },
    async submitEmployerReview(applicationId, input) {
      await wait(200);
      const me = requireUser("teen");
      const db = load();
      const a = db.applications.find((x) => x.id === applicationId && x.teen_id === me.id);
      if (!a) throw new DataError("not_found", "Application not found.");
      if (a.status !== "selected" || !a.completed_at) throw new DataError("invalid", "You can rate an employer after the job is marked completed.");
      if (db.employer_reviews.some((r) => r.application_id === applicationId)) throw new DataError("duplicate", "You already rated this job.");
      if (!Number.isInteger(input.stars) || input.stars < 1 || input.stars > 5) throw new DataError("invalid", "Choose 1 to 5 stars.");
      db.employer_reviews.unshift({
        id: uid("rev"), application_id: a.id, job_id: a.job_id, employer_id: a.employer_id, teen_id: me.id, stars: input.stars,
        paid_as_promised: input.paid_as_promised, matched_listing: input.matched_listing, felt_safe: input.felt_safe, respectful: input.respectful,
        private_note: input.private_note?.trim().slice(0, 1000) || null, status: "published", created_at: now(),
      });
      persist();
    },
    async listMyEmployerReviews() {
      const me = requireUser("employer");
      const db = load();
      return db.employer_reviews
        .filter((r) => r.employer_id === me.id)
        .map((r) => ({
          id: r.id, job_title: db.jobs.find((j) => j.id === r.job_id)?.title ?? "Job", stars: r.stars, paid_as_promised: r.paid_as_promised,
          matched_listing: r.matched_listing, felt_safe: r.felt_safe, respectful: r.respectful, status: r.status, created_at: r.created_at,
        }));
    },
    async getMyTeenFeedback(applicationId) {
      const me = requireUser("employer");
      return load().teen_feedback.find((f) => f.application_id === applicationId && f.employer_id === me.id) ?? null;
    },
    async submitTeenFeedback(applicationId, input) {
      await wait(200);
      const me = requireUser("employer");
      const db = load();
      const a = db.applications.find((x) => x.id === applicationId && x.employer_id === me.id);
      if (!a) throw new DataError("not_found", "Application not found.");
      if (a.status !== "selected" || !a.completed_at) throw new DataError("invalid", "Mark the job completed before leaving feedback.");
      if (db.teen_feedback.some((f) => f.application_id === applicationId)) throw new DataError("duplicate", "You already left feedback for this job.");
      db.teen_feedback.unshift({
        id: uid("tfb"), application_id: a.id, job_id: a.job_id, employer_id: me.id, teen_id: a.teen_id,
        showed_up: input.showed_up, communicated: input.communicated, completed_job: input.completed_job,
        note: input.note?.trim().slice(0, 1000) || null, created_at: now(),
      });
      persist();
    },

    // ----------------------------------------------------------------- safety
    async createReport(input) {
      await wait(300);
      const db = load();
      const s = currentSession();
      const r = { id: uid("rep"), reporter_id: s?.user.id ?? null, ...input, status: "open" as const, resolution_note: null, created_at: now(), updated_at: now() };
      db.reports.unshift(r);
      db.users.filter((u) => u.role === "admin").forEach((adm) =>
        pushNotification(db, adm.id, "system", input.severity === "emergency" ? "EMERGENCY safety report" : "New report", `${input.reason}: ${input.details.slice(0, 80)}`, "/admin/reports"),
      );
      if (input.severity !== "normal") sendDemoEmail(db, safetyReportEmail({ to: SAFETY_EMAIL, site: site(), severity: input.severity, reason: input.reason, details: input.details, reportId: r.id }));
      persist();
      return r;
    },
    async blockUser(userId) {
      const me = requireUser();
      const db = load();
      if (!db.blocks.some((b) => b.blocker_id === me.id && b.blocked_id === userId)) db.blocks.push({ blocker_id: me.id, blocked_id: userId, created_at: now() });
      persist();
    },
    async unblockUser(userId) {
      const me = requireUser();
      const db = load();
      db.blocks = db.blocks.filter((b) => !(b.blocker_id === me.id && b.blocked_id === userId));
      persist();
    },
    async listBlockedUserIds() {
      const s = currentSession();
      if (!s) return [];
      return load().blocks.filter((b) => b.blocker_id === s.user.id).map((b) => b.blocked_id);
    },

    // ---------------------------------------------------------------- account
    async updateAccount(patch) {
      const me = requireUser();
      const db = load();
      const u = db.users.find((x) => x.id === me.id)!;
      if (patch.full_name !== undefined) u.full_name = patch.full_name.trim();
      if (patch.phone !== undefined) u.phone = patch.phone;
      persist();
      setSession(u.id);
      return stripPassword(u);
    },
    async deleteAccountRequest() {
      const me = requireUser();
      const db = load();
      db.reports.unshift({ id: uid("rep"), reporter_id: me.id, target_type: "user", target_id: me.id, reason: "Account deletion request", details: "User requested account and data deletion.", severity: "normal", contact_email: me.email, status: "open", resolution_note: null, created_at: now(), updated_at: now() });
      persist();
    },

    // ------------------------------------------------------------------ admin
    async adminStats() {
      requireUser("admin");
      const db = load();
      return {
        users: db.users.length,
        teens: db.users.filter((u) => u.role === "teen").length,
        employers: db.users.filter((u) => u.role === "employer").length,
        publishedJobs: db.jobs.filter(isPublic).length,
        pendingJobs: db.jobs.filter((j) => j.moderation_status === "pending" && j.status !== "draft").length,
        applications: db.applications.length,
        openReports: db.reports.filter((r) => r.status === "open" || r.status === "investigating").length,
        emergencyReports: db.reports.filter((r) => r.severity === "emergency" && r.status !== "resolved" && r.status !== "dismissed").length,
        pendingVerifications: db.verification_requests.filter((v) => v.status === "pending").length,
      };
    },
    async adminListVerificationRequests() {
      requireUser("admin");
      const db = load();
      return db.verification_requests.map((v) => ({ ...v, employer_name: db.employer_profiles.find((e) => e.user_id === v.employer_id)?.display_name ?? "Unknown" }));
    },
    async adminReviewVerification(id, approve, note) {
      const me = requireUser("admin");
      const db = load();
      const v = db.verification_requests.find((x) => x.id === id);
      if (!v) throw new DataError("not_found", "Request not found.");
      v.status = approve ? "approved" : "rejected";
      v.reviewer_id = me.id;
      v.review_note = note || null;
      v.reviewed_at = now();
      const e = db.employer_profiles.find((x) => x.user_id === v.employer_id);
      if (e) e.verification_status = approve ? "verified" : "rejected";
      pushNotification(db, v.employer_id, "verification_update", approve ? "Profile review approved" : "Profile review not approved", approve ? "A TaskTeens administrator reviewed your profile. A “Reviewed” badge now shows on your listings. This is not a background check." : `Your verification request was not approved.${note ? ` Note: ${note}` : ""}`, "/dashboard/employer/settings");
      audit(db, me.id, approve ? "verification.approve" : "verification.reject", "employer", v.employer_id, note);
      persist();
    },
    async adminListJobs(filter) {
      requireUser("admin");
      const db = load();
      return db.jobs
        .filter((j) => (!filter?.moderation || j.moderation_status === filter.moderation) && (!filter?.status || j.status === filter.status) && (!filter?.q || j.title.toLowerCase().includes(filter.q.toLowerCase())))
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map((j) => withEmployer(db, j));
    },
    async adminModerateJob(id, action, note) {
      const me = requireUser("admin");
      const db = load();
      const j = db.jobs.find((x) => x.id === id);
      if (!j) throw new DataError("not_found", "Listing not found.");
      switch (action) {
        case "approve": j.moderation_status = "approved"; break;
        case "reject": j.moderation_status = "rejected"; break;
        case "pause": j.status = "paused"; break;
        case "remove": j.status = "removed"; break;
        case "restore": j.status = "published"; j.moderation_status = "approved"; break;
        case "feature": j.featured = true; break;
        case "unfeature": j.featured = false; break;
      }
      j.updated_at = now();
      if (["approve", "reject", "pause", "remove"].includes(action))
        pushNotification(db, j.employer_id, "listing_moderation", `Listing ${action === "approve" ? "approved" : action === "reject" ? "not approved" : action === "pause" ? "paused by moderator" : "removed"}`, `“${j.title}”${note ? ` — ${note}` : ""}`, "/dashboard/employer/listings");
      audit(db, me.id, `job.${action}`, "job", id, note);
      persist();
    },
    async adminListReports() {
      requireUser("admin");
      const order = { emergency: 0, urgent: 1, normal: 2 };
      return [...load().reports].sort((a, b) => order[a.severity] - order[b.severity] || b.created_at.localeCompare(a.created_at));
    },
    async adminUpdateReport(id, status, note) {
      const me = requireUser("admin");
      const db = load();
      const r = db.reports.find((x) => x.id === id);
      if (!r) throw new DataError("not_found", "Report not found.");
      r.status = status;
      r.resolution_note = note || r.resolution_note;
      r.updated_at = now();
      audit(db, me.id, `report.${status}`, "report", id, note);
      persist();
    },
    async adminListUsers(q) {
      requireUser("admin");
      const t = q?.toLowerCase() ?? "";
      return load().users.filter((u) => !t || u.email.includes(t) || u.full_name.toLowerCase().includes(t)).map(stripPassword);
    },
    async adminSetUserStatus(id, status, note) {
      const me = requireUser("admin");
      if (id === me.id) throw new DataError("forbidden", "You can't suspend your own account.");
      const db = load();
      const u = db.users.find((x) => x.id === id);
      if (!u) throw new DataError("not_found", "User not found.");
      u.status = status;
      audit(db, me.id, status === "suspended" ? "user.suspend" : "user.reinstate", "user", id, note);
      persist();
    },
    async adminUpsertCategory(cat) {
      const me = requireUser("admin");
      const db = load();
      const i = db.categories.findIndex((c) => c.slug === cat.slug);
      if (i >= 0) db.categories[i] = cat;
      else db.categories.push(cat);
      audit(db, me.id, i >= 0 ? "category.update" : "category.create", "category", cat.slug, null, { active: cat.active });
      persist();
    },
    async adminUpsertServiceArea(area) {
      const me = requireUser("admin");
      const db = load();
      const i = db.service_areas.findIndex((c) => c.slug === area.slug);
      if (i >= 0) db.service_areas[i] = area;
      else db.service_areas.push(area);
      audit(db, me.id, i >= 0 ? "service_area.update" : "service_area.create", "service_area", area.slug, null, { active: area.active });
      persist();
    },
    async adminUpdateSettings(patch) {
      const me = requireUser("admin");
      const db = load();
      db.settings = { ...db.settings, ...patch };
      audit(db, me.id, "settings.update", "settings", null, null, patch as Record<string, unknown>);
      persist();
    },
    async adminListAuditLogs() {
      requireUser("admin");
      return load().admin_audit_logs.slice(0, 200);
    },
    async adminRecentActivity() {
      requireUser("admin");
      const db = load();
      const items = [
        ...db.applications.map((a) => ({ kind: "application", label: `${a.applicant_name} applied to ${db.jobs.find((j) => j.id === a.job_id)?.title ?? "a job"}`, at: a.created_at })),
        ...db.jobs.map((j) => ({ kind: "job", label: `Listing created: ${j.title}`, at: j.created_at })),
        ...db.users.map((u) => ({ kind: "user", label: `${u.role} account created: ${u.full_name}`, at: u.created_at })),
        ...db.reports.map((r) => ({ kind: "report", label: `Report (${r.severity}): ${r.reason}`, at: r.created_at })),
      ];
      return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 25);
    },
    async adminAddNote(targetType, targetId, note) {
      const me = requireUser("admin");
      const db = load();
      audit(db, me.id, "moderation.note", targetType, targetId, note);
      persist();
    },

    async adminListReviews() {
      requireUser("admin");
      const db = load();
      return db.employer_reviews.map((r) => ({
        ...r,
        employer_name: db.employer_profiles.find((e) => e.user_id === r.employer_id)?.display_name ?? "Employer",
        job_title: db.jobs.find((j) => j.id === r.job_id)?.title ?? "Job",
        teen_name: db.users.find((u) => u.id === r.teen_id)?.full_name ?? "Teen",
      }));
    },
    async adminSetReviewStatus(id, status, note) {
      const me = requireUser("admin");
      const db = load();
      const r = db.employer_reviews.find((x) => x.id === id);
      if (!r) throw new DataError("not_found", "Review not found.");
      r.status = status;
      audit(db, me.id, status === "hidden" ? "review.hide" : "review.restore", "review", id, note);
      persist();
    },
    async adminListTeenFeedback() {
      requireUser("admin");
      const db = load();
      return db.teen_feedback.map((f) => ({
        ...f,
        employer_name: db.employer_profiles.find((e) => e.user_id === f.employer_id)?.display_name ?? "Employer",
        job_title: db.jobs.find((j) => j.id === f.job_id)?.title ?? "Job",
        teen_name: db.users.find((u) => u.id === f.teen_id)?.full_name ?? "Teen",
      }));
    },

    // --------------------------------------------------------------- demo
    async demoOutbox() {
      return load().outbox.slice(0, 100);
    },
    async demoReset() {
      memoryDb = buildSeed();
      persist();
      try {
        window.localStorage.removeItem(FILES_KEY);
      } catch {
        /* ignore */
      }
    },
  };
}

function interviewCtx(db: DemoDB, i: DemoDB["interview_requests"][number]): InterviewWithContext {
  return {
    ...i,
    job_title: db.jobs.find((j) => j.id === i.job_id)?.title ?? "Job",
    employer_name: db.employer_profiles.find((e) => e.user_id === i.employer_id)?.display_name ?? "Employer",
    applicant_name: db.applications.find((a) => a.id === i.application_id)?.applicant_name ?? "Applicant",
  };
}
