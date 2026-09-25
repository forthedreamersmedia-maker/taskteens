// Domain types shared by the UI, the demo (mock) data layer and the Supabase data layer.
// Column names mirror supabase/migrations/0001_schema.sql (snake_case).

export type Role = "teen" | "employer" | "admin";
export type AccountStatus = "active" | "suspended";

export type JobStatus = "draft" | "published" | "paused" | "closed" | "removed";
export type ModerationStatus = "pending" | "approved" | "rejected";
export type Recurrence = "one_time" | "recurring";
export type WorkMode = "in_person" | "remote" | "hybrid";
export type PayType = "hourly" | "flat" | "stipend" | "unpaid";
/** job = paid work · internship = learning-focused role (paid, or unpaid at a nonprofit) · volunteer = unpaid service for a nonprofit/school/public/community group */
export type OpportunityType = "job" | "internship" | "volunteer";
export type Transportation = "none_needed" | "transit_accessible" | "bike_or_walk" | "own_transportation" | "employer_provides";

export type ApplicationStatus =
  | "submitted"
  | "viewed"
  | "interview_requested"
  | "selected"
  | "not_selected"
  | "withdrawn";

export type VerificationStatus = "unverified" | "pending" | "verified" | "rejected";
export type EmployerType = "individual" | "business";

export type AgeRange = "14-15" | "16-17" | "18-19";
export type WorkPermitStatus = "not_required" | "have_permit" | "in_progress" | "not_sure";
export type GuardianConsentStatus = "not_applicable" | "obtained" | "will_obtain";

export interface UserRow {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  status: AccountStatus;
  phone: string | null;
  created_at: string;
}

export interface TeenProfile {
  user_id: string;
  display_name: string;
  age_range: AgeRange | null;
  city: string | null;
  bio: string | null;
  skills: string[];
  experience: string | null;
  availability: Record<string, string[]>; // e.g. { mon: ["afternoon"], sat: ["morning","afternoon"] }
  transportation: Transportation | null;
  resume_path: string | null;
  resume_name: string | null;
  portfolio_url: string | null;
  work_permit_status: WorkPermitStatus | null;
  guardian_consent_status: GuardianConsentStatus | null;
  email_notifications: boolean;
  created_at: string;
  updated_at: string;
}

export interface EmployerProfile {
  user_id: string;
  employer_type: EmployerType;
  display_name: string; // person or business name shown publicly
  city: string;
  service_area: string | null;
  website: string | null;
  description: string | null;
  logo_url: string | null;
  verification_status: VerificationStatus;
  agreed_to_rules_at: string | null;
  onboarded: boolean;
  created_at: string;
  updated_at: string;
}

export interface Job {
  id: string;
  employer_id: string;
  title: string;
  opportunity_type: OpportunityType;
  /** Employer confirmed the host is a nonprofit, school, public agency or community group (required for unpaid listings). */
  nonprofit_attested: boolean;
  category: string; // category slug
  description: string;
  responsibilities: string[];
  required_skills: string[];
  preferred_skills: string[];
  city: string;
  neighborhood: string | null; // approximate only — never an exact address
  service_area: string;
  work_mode: WorkMode;
  pay_type: PayType;
  pay_min: number;
  pay_max: number | null;
  schedule: string; // human description, e.g. "Sat mornings, 3 hrs"
  schedule_tags: string[]; // weekday | weekend | afternoon | evening | morning | flexible
  min_age: number;
  start_date: string | null;
  recurrence: Recurrence;
  openings: number;
  deadline: string | null;
  transportation: Transportation;
  transportation_notes: string | null;
  image_url: string | null;
  status: JobStatus;
  moderation_status: ModerationStatus;
  featured: boolean;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
  published_at: string | null;
}

/** Job joined with the public-safe employer fields. */
export interface JobWithEmployer extends Job {
  employer: Pick<EmployerProfile, "user_id" | "display_name" | "employer_type" | "verification_status" | "city" | "website" | "description">;
}

export interface Application {
  id: string;
  job_id: string;
  employer_id: string;
  teen_id: string;
  status: ApplicationStatus;
  applicant_name: string;
  applicant_email: string;
  applicant_phone: string;
  age_range: AgeRange;
  city: string;
  experience: string;
  skills: string[];
  availability: string;
  transportation: Transportation;
  interest_statement: string;
  resume_path: string | null;
  resume_name: string | null;
  portfolio_url: string | null;
  work_permit_status: WorkPermitStatus;
  guardian_consent_status: GuardianConsentStatus;
  agreed_to_safety_rules: boolean;
  viewed_at: string | null;
  status_updated_at: string;
  created_at: string;
  /** Set when either side marks a selected job as done. Reviews/feedback unlock after this. */
  completed_at: string | null;
  completed_by: "teen" | "employer" | null;
}

export interface ApplicationWithJob extends Application {
  job: Pick<Job, "id" | "title" | "city" | "neighborhood" | "category" | "image_url" | "pay_min" | "pay_max" | "pay_type" | "status" | "opportunity_type">;
  employer_name: string;
}

export interface ApplicationNote {
  id: string;
  application_id: string;
  employer_id: string;
  body: string;
  created_at: string;
}

export interface SavedJob {
  user_id: string;
  job_id: string;
  created_at: string;
}

export type NotificationKind =
  | "application_received"
  | "application_status"
  | "interview_requested"
  | "interview_response"
  | "verification_update"
  | "listing_moderation"
  | "system";

export interface Notification {
  id: string;
  user_id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

export type InterviewStatus = "proposed" | "accepted" | "declined" | "cancelled" | "completed";
export type InterviewFormat = "video" | "phone" | "in_person_public";

export interface InterviewRequest {
  id: string;
  application_id: string;
  job_id: string;
  employer_id: string;
  teen_id: string;
  proposed_times: string[]; // ISO datetimes
  confirmed_time: string | null;
  format: InterviewFormat;
  location_note: string | null; // e.g. "Albany Library lobby" — public place only
  message: string | null;
  guardian_invited: boolean;
  status: InterviewStatus;
  created_at: string;
  updated_at: string;
}

export type ReportTarget = "job" | "user" | "application" | "review" | "other";
export type ReportSeverity = "normal" | "urgent" | "emergency";
export type ReportStatus = "open" | "investigating" | "resolved" | "dismissed";

export interface Report {
  id: string;
  reporter_id: string | null;
  target_type: ReportTarget;
  target_id: string | null;
  reason: string;
  details: string;
  severity: ReportSeverity;
  contact_email: string | null;
  status: ReportStatus;
  resolution_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface VerificationRequest {
  id: string;
  employer_id: string;
  employer_type: EmployerType;
  submitted_info: {
    legal_name: string;
    business_registration?: string | null;
    website?: string | null;
    notes?: string | null;
  };
  status: "pending" | "approved" | "rejected";
  reviewer_id: string | null;
  review_note: string | null;
  created_at: string;
  reviewed_at: string | null;
}

export interface AdminAuditLog {
  id: string;
  admin_id: string;
  action: string;
  target_type: string;
  target_id: string | null;
  note: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

/** Public employer review left by a teen after a completed job. Only aggregates are public. */
export type ReviewStatus = "published" | "hidden";
export interface EmployerReview {
  id: string;
  application_id: string;
  job_id: string;
  employer_id: string;
  teen_id: string;
  stars: number; // 1-5
  paid_as_promised: boolean | null; // null for volunteer roles
  matched_listing: boolean;
  felt_safe: boolean;
  respectful: boolean;
  private_note: string | null; // seen by TaskTeens moderators only
  status: ReviewStatus;
  created_at: string;
}

/** What an employer sees about reviews of them — no teen identity, no private note. */
export interface EmployerReviewForEmployer {
  id: string;
  job_title: string;
  stars: number;
  paid_as_promised: boolean | null;
  matched_listing: boolean;
  felt_safe: boolean;
  respectful: boolean;
  status: ReviewStatus;
  created_at: string;
}

/** Private structured feedback an employer gives TaskTeens about a teen. Never public. */
export interface TeenFeedback {
  id: string;
  application_id: string;
  job_id: string;
  employer_id: string;
  teen_id: string;
  showed_up: boolean;
  communicated: boolean;
  completed_job: boolean;
  note: string | null;
  created_at: string;
}

export interface EmployerRatingSummary {
  employer_id: string;
  completed_jobs: number;
  review_count: number;
  /** null until the employer has at least MIN_REVIEWS_FOR_SCORE published reviews */
  avg_stars: number | null;
  pct_paid: number | null;
  pct_matched: number | null;
  pct_respectful: number | null;
  pct_safe: number | null;
  reliable: boolean;
}

export interface EmployerReviewInput {
  stars: number;
  paid_as_promised: boolean | null;
  matched_listing: boolean;
  felt_safe: boolean;
  respectful: boolean;
  private_note?: string;
}

export interface TeenFeedbackInput {
  showed_up: boolean;
  communicated: boolean;
  completed_job: boolean;
  note?: string;
}

export interface Block {
  blocker_id: string;
  blocked_id: string;
  created_at: string;
}

export interface Category {
  slug: string;
  name: string;
  description: string;
  icon: string;
  active: boolean;
  sort: number;
}

export interface ServiceArea {
  slug: string;
  name: string;
  cities: string[];
  active: boolean;
}

export interface PlatformSettings {
  min_worker_age: number;
  guardian_consent_under_age: number; // guardian consent field required when age range is below this
  work_permit_reminder_under_age: number; // show work-permit guidance when below this
  require_job_approval: boolean; // new listings need admin approval before going public
  rules_note: string; // shown on apply page; must be reviewed by counsel before launch
}

export interface EmailLogEntry {
  id: string;
  to: string;
  subject: string;
  text: string;
  created_at: string;
  delivered: "demo_outbox" | "resend" | "skipped";
}

// ---------- Inputs ----------

export interface JobFilters {
  q?: string;
  opportunity_type?: OpportunityType | "";
  city?: string;
  area?: string;
  category?: string;
  recurrence?: Recurrence | "";
  work_mode?: WorkMode | "";
  max_min_age?: number; // show jobs whose min age <= this
  pay_type?: PayType | "";
  pay_min?: number;
  pay_max?: number;
  schedule?: string; // schedule tag
  posted_within_days?: number;
  sort?: "newest" | "pay_high" | "deadline";
}

export interface ApplicationInput {
  job_id: string;
  applicant_name: string;
  age_range: AgeRange;
  city: string;
  applicant_email: string;
  applicant_phone: string;
  experience: string;
  skills: string[];
  availability: string;
  transportation: Transportation;
  interest_statement: string;
  resume_file?: File | null;
  portfolio_url?: string;
  work_permit_status: WorkPermitStatus;
  guardian_consent_status: GuardianConsentStatus;
  agreed_to_safety_rules: boolean;
}

export type JobInput = Omit<
  Job,
  "id" | "employer_id" | "created_at" | "updated_at" | "published_at" | "moderation_status" | "featured" | "is_demo" | "image_url"
> & { image_file?: File | null; image_url?: string | null };

export interface SignUpInput {
  email: string;
  password: string;
  full_name: string;
  role: Exclude<Role, "admin">;
  /** Cloudflare Turnstile token, verified by Supabase Auth when CAPTCHA protection is on. */
  captchaToken?: string | null;
}

export interface EmployerOnboardingInput {
  employer_type: EmployerType;
  display_name: string;
  phone: string;
  city: string;
  service_area: string;
  website: string;
  description: string;
  request_verification: boolean;
  legal_name: string;
  business_registration: string;
  verification_notes: string;
  agreed_to_rules: boolean;
}

export interface Session {
  user: UserRow;
}
