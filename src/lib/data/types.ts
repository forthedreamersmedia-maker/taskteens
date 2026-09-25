import type {
  AdminAuditLog,
  Application,
  ApplicationNote,
  ApplicationStatus,
  ApplicationWithJob,
  AccountStatus,
  Category,
  EmailLogEntry,
  EmployerOnboardingInput,
  EmployerProfile,
  InterviewFormat,
  InterviewRequest,
  Job,
  JobFilters,
  JobInput,
  JobStatus,
  JobWithEmployer,
  Notification,
  PlatformSettings,
  Report,
  ReportStatus,
  ServiceArea,
  Session,
  SignUpInput,
  TeenProfile,
  UserRow,
  VerificationRequest,
  ApplicationInput,
  EmployerRatingSummary,
  EmployerReview,
  EmployerReviewForEmployer,
  EmployerReviewInput,
  ReviewStatus,
  TeenFeedback,
  TeenFeedbackInput,
} from "../types";

export class DataError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export interface InterviewWithContext extends InterviewRequest {
  job_title: string;
  employer_name: string;
  applicant_name: string;
}

export interface EmployerStats {
  active: number;
  drafts: number;
  closed: number;
  paused: number;
  totalApplications: number;
  newApplications: number;
  interviews: number;
}

export interface AdminStats {
  users: number;
  teens: number;
  employers: number;
  publishedJobs: number;
  pendingJobs: number;
  applications: number;
  openReports: number;
  emergencyReports: number;
  pendingVerifications: number;
}

export type ModerationAction = "approve" | "reject" | "pause" | "remove" | "restore" | "feature" | "unfeature";

export interface InterviewInput {
  proposed_times: string[];
  format: InterviewFormat;
  location_note: string;
  message: string;
  guardian_invited: boolean;
}

export interface ReportInput {
  target_type: Report["target_type"];
  target_id: string | null;
  reason: string;
  details: string;
  severity: Report["severity"];
  contact_email: string | null;
}

/**
 * The single contract every screen talks to. Two implementations exist:
 *  - mock.ts     → local demonstration mode (localStorage)
 *  - supabase.ts → production (Supabase Auth + Postgres + RLS + Storage, API routes for email)
 * Swap by setting env vars; no UI changes needed.
 */
export interface DataClient {
  mode: "demo" | "supabase";

  // ---- auth ----
  getSession(): Promise<Session | null>;
  onAuthChange(cb: (s: Session | null) => void): () => void;
  signUp(input: SignUpInput): Promise<{ needsEmailVerification: boolean }>;
  signIn(email: string, password: string): Promise<Session>;
  signOut(): Promise<void>;
  requestPasswordReset(email: string): Promise<void>;
  updatePassword(password: string): Promise<void>;
  resendVerification(email: string): Promise<void>;

  // ---- public ----
  getSettings(): Promise<PlatformSettings>;
  listCategories(includeInactive?: boolean): Promise<Category[]>;
  listServiceAreas(includeInactive?: boolean): Promise<ServiceArea[]>;
  searchJobs(filters: JobFilters): Promise<JobWithEmployer[]>;
  getFeaturedJobs(limit?: number): Promise<JobWithEmployer[]>;
  getJob(id: string): Promise<JobWithEmployer | null>;
  getSimilarJobs(job: Job, limit?: number): Promise<JobWithEmployer[]>;

  // ---- teen ----
  getTeenProfile(): Promise<TeenProfile | null>;
  updateTeenProfile(patch: Partial<TeenProfile>): Promise<TeenProfile>;
  uploadResume(file: File): Promise<{ path: string; name: string }>;
  getResumeUrl(path: string): Promise<string | null>;
  listSavedJobIds(): Promise<string[]>;
  toggleSavedJob(jobId: string): Promise<boolean>; // returns saved state
  listSavedJobs(): Promise<JobWithEmployer[]>;
  getMyApplicationForJob(jobId: string): Promise<Application | null>;
  submitApplication(input: ApplicationInput): Promise<Application>;
  listMyApplications(): Promise<ApplicationWithJob[]>;
  withdrawApplication(id: string): Promise<void>;
  listMyInterviews(): Promise<InterviewWithContext[]>;
  respondToInterview(id: string, accept: boolean, time?: string): Promise<void>;
  getRecommendedJobs(limit?: number): Promise<JobWithEmployer[]>;

  // ---- notifications ----
  listNotifications(): Promise<Notification[]>;
  markNotificationRead(id: string): Promise<void>;
  markAllNotificationsRead(): Promise<void>;
  subscribeNotifications(cb: () => void): () => void;

  // ---- employer ----
  getEmployerProfile(): Promise<EmployerProfile | null>;
  saveEmployerOnboarding(input: EmployerOnboardingInput): Promise<EmployerProfile>;
  getMyVerificationRequest(): Promise<VerificationRequest | null>;
  listMyJobs(): Promise<Job[]>;
  getMyJob(id: string): Promise<Job | null>;
  createJob(input: JobInput): Promise<Job>;
  updateJob(id: string, input: Partial<JobInput>): Promise<Job>;
  setJobStatus(id: string, status: JobStatus): Promise<void>;
  deleteJob(id: string): Promise<void>;
  uploadJobImage(file: File): Promise<string>;
  getEmployerStats(): Promise<EmployerStats>;
  listEmployerApplications(jobId?: string): Promise<ApplicationWithJob[]>;
  getEmployerApplication(id: string): Promise<ApplicationWithJob | null>;
  markApplicationViewed(id: string): Promise<void>;
  updateApplicationStatus(id: string, status: ApplicationStatus, message?: string): Promise<void>;
  listApplicationNotes(applicationId: string): Promise<ApplicationNote[]>;
  addApplicationNote(applicationId: string, body: string): Promise<ApplicationNote>;
  requestInterview(applicationId: string, input: InterviewInput): Promise<InterviewRequest>;
  listEmployerInterviews(): Promise<InterviewWithContext[]>;

  // ---- completion, ratings & feedback ----
  /** Teen or employer marks a *selected* application's job as completed. Unlocks reviews/feedback. */
  markApplicationCompleted(applicationId: string): Promise<void>;
  /** Public, aggregate-only rating summaries for the given employers. */
  getEmployerRatings(employerIds: string[]): Promise<Record<string, EmployerRatingSummary>>;
  /** Teen: their own review for an application, if any. */
  getMyReviewForApplication(applicationId: string): Promise<EmployerReview | null>;
  submitEmployerReview(applicationId: string, input: EmployerReviewInput): Promise<void>;
  /** Employer: reviews about them — without teen identity or private notes. */
  listMyEmployerReviews(): Promise<EmployerReviewForEmployer[]>;
  /** Employer: private feedback they gave TaskTeens about a teen for this application. */
  getMyTeenFeedback(applicationId: string): Promise<TeenFeedback | null>;
  submitTeenFeedback(applicationId: string, input: TeenFeedbackInput): Promise<void>;

  // ---- safety ----
  createReport(input: ReportInput): Promise<Report>;
  blockUser(userId: string): Promise<void>;
  unblockUser(userId: string): Promise<void>;
  listBlockedUserIds(): Promise<string[]>;

  // ---- account ----
  updateAccount(patch: { full_name?: string; phone?: string | null }): Promise<UserRow>;
  deleteAccountRequest(): Promise<void>;

  // ---- admin ----
  adminStats(): Promise<AdminStats>;
  adminListVerificationRequests(): Promise<(VerificationRequest & { employer_name: string })[]>;
  adminReviewVerification(id: string, approve: boolean, note: string): Promise<void>;
  adminListJobs(filter?: { moderation?: string; status?: string; q?: string }): Promise<JobWithEmployer[]>;
  adminModerateJob(id: string, action: ModerationAction, note: string): Promise<void>;
  adminListReports(): Promise<Report[]>;
  adminUpdateReport(id: string, status: ReportStatus, note: string): Promise<void>;
  adminListUsers(q?: string): Promise<UserRow[]>;
  adminSetUserStatus(id: string, status: AccountStatus, note: string): Promise<void>;
  adminUpsertCategory(cat: Category): Promise<void>;
  adminUpsertServiceArea(area: ServiceArea): Promise<void>;
  adminUpdateSettings(patch: Partial<PlatformSettings>): Promise<void>;
  adminListAuditLogs(): Promise<AdminAuditLog[]>;
  adminRecentActivity(): Promise<{ kind: string; label: string; at: string }[]>;
  adminAddNote(targetType: string, targetId: string, note: string): Promise<void>;
  adminListReviews(): Promise<(EmployerReview & { employer_name: string; job_title: string; teen_name: string })[]>;
  adminSetReviewStatus(id: string, status: ReviewStatus, note: string): Promise<void>;
  adminListTeenFeedback(): Promise<(TeenFeedback & { employer_name: string; job_title: string; teen_name: string })[]>;

  // ---- demo only ----
  demoOutbox?(): Promise<EmailLogEntry[]>;
  demoReset?(): Promise<void>;
}
