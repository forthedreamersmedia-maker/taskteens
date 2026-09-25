import type {
  AgeRange,
  ApplicationStatus,
  Category,
  GuardianConsentStatus,
  PayType,
  PlatformSettings,
  Recurrence,
  ServiceArea,
  Transportation,
  WorkMode,
  WorkPermitStatus,
} from "./types";

export const SITE_NAME = "TaskTeens";
export const TAGLINE = "Making Job Hunting Easier For Teens";
export const CONTACT_EMAIL = "hello@taskteens.com";
export const SAFETY_EMAIL = "hello@taskteens.com";

const u = (id: string, w = 1200) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=70`;

export const IMAGES = {
  hero: u("photo-1529156069898-49953e39b3ac", 1600),
  heroAlt: u("photo-1522202176988-66273c2fd55f", 1200),
  bay: "/hero-bay-sm.jpg",
  employer: u("photo-1556761175-5973dc0f32e7", 1400),
  safety: u("photo-1521791136064-7986c2920216", 1200),
};

export const CATEGORIES: Category[] = [
  { slug: "tutoring", name: "Tutoring", description: "Homework help, test prep, reading buddies", icon: "GraduationCap", active: true, sort: 1 },
  { slug: "pet-care", name: "Pet care", description: "Dog walking, pet sitting, feeding visits", icon: "PawPrint", active: true, sort: 2 },
  { slug: "childcare-support", name: "Childcare support", description: "Parent's-helper and supervised care support", icon: "Baby", active: true, sort: 3 },
  { slug: "yard-work", name: "Yard work", description: "Raking, weeding, watering, light gardening", icon: "Leaf", active: true, sort: 4 },
  { slug: "tech-help", name: "Technology help", description: "Phone setup, computer help, smart-home basics", icon: "Laptop", active: true, sort: 5 },
  { slug: "photo-content", name: "Photography & content", description: "Event photos, social posts, short video", icon: "Camera", active: true, sort: 6 },
  { slug: "restaurant-retail", name: "Restaurant & retail", description: "Counter help, stocking, front-of-house", icon: "Store", active: true, sort: 7 },
  { slug: "event-assistance", name: "Event assistance", description: "Setup, check-in, cleanup for local events", icon: "PartyPopper", active: true, sort: 8 },
  { slug: "household-help", name: "Household help", description: "Organizing, moving boxes, errands", icon: "Home", active: true, sort: 9 },
  { slug: "admin-work", name: "Administrative work", description: "Data entry, filing, scheduling support", icon: "ClipboardList", active: true, sort: 10 },
];

export const CATEGORY_IMAGES: Record<string, string> = {
  tutoring: u("photo-1522202176988-66273c2fd55f"),
  "pet-care": u("photo-1601758228041-f3b2795255f1"),
  "childcare-support": u("photo-1503454537195-1dcabb73ffb9"),
  "yard-work": u("photo-1416879595882-3373a0480b5b"),
  "tech-help": u("photo-1517694712202-14dd9538aa97"),
  "photo-content": u("photo-1502920917128-1aa500764cbd"),
  "restaurant-retail": u("photo-1554118811-1e0d58224f24"),
  "event-assistance": u("photo-1511578314322-379afb476865"),
  "household-help": u("photo-1581578731548-c64695cc6952"),
  "admin-work": u("photo-1497215728101-856f4ea42174"),
};

export const SERVICE_AREAS: ServiceArea[] = [
  { slug: "berkeley", name: "Berkeley", cities: ["Berkeley"], active: true },
  { slug: "albany", name: "Albany", cities: ["Albany"], active: true },
  { slug: "el-cerrito", name: "El Cerrito", cities: ["El Cerrito"], active: true },
  { slug: "richmond-kensington", name: "Richmond & Kensington", cities: ["Richmond", "Kensington"], active: true },
  { slug: "remote", name: "Remote (East Bay employers)", cities: ["Remote"], active: true },
];

export const CITIES = ["Berkeley", "Albany", "El Cerrito", "Richmond", "Kensington", "Remote"];

export const NEIGHBORHOODS: Record<string, string[]> = {
  Berkeley: ["North Berkeley", "Elmwood", "Downtown Berkeley", "Thousand Oaks", "West Berkeley", "Claremont", "Southside"],
  Albany: ["Solano Ave area", "Albany Hill", "Central Albany"],
  "El Cerrito": ["El Cerrito Plaza area", "Del Norte area", "El Cerrito Hills"],
  Richmond: ["Point Richmond", "Richmond Annex", "Marina Bay"],
  Kensington: ["Kensington"],
  Remote: [],
};

export const APPLICATION_STATUS_LABEL: Record<ApplicationStatus, string> = {
  submitted: "Submitted",
  viewed: "Viewed",
  interview_requested: "Interview requested",
  selected: "Selected",
  not_selected: "Not selected",
  withdrawn: "Withdrawn",
};

export const APPLICATION_STATUS_TONE: Record<ApplicationStatus, "blue" | "navy" | "coral" | "green" | "gray"> = {
  submitted: "blue",
  viewed: "navy",
  interview_requested: "coral",
  selected: "green",
  not_selected: "gray",
  withdrawn: "gray",
};

export const RECURRENCE_LABEL: Record<Recurrence, string> = { one_time: "One-time", recurring: "Recurring" };
export const WORK_MODE_LABEL: Record<WorkMode, string> = { in_person: "In person", remote: "Remote", hybrid: "Hybrid" };
export const PAY_TYPE_LABEL: Record<PayType, string> = { hourly: "Hourly", flat: "Flat rate", stipend: "Stipend" };
export const TRANSPORTATION_LABEL: Record<Transportation, string> = {
  none_needed: "No travel needed (remote)",
  transit_accessible: "Near BART / AC Transit",
  bike_or_walk: "Walkable or bikeable",
  own_transportation: "Own transportation needed",
  employer_provides: "Employer provides transportation",
};
export const AGE_RANGES: AgeRange[] = ["14-15", "16-17", "18-19"];
export const WORK_PERMIT_LABEL: Record<WorkPermitStatus, string> = {
  not_required: "I believe I don't need one",
  have_permit: "I have a work permit",
  in_progress: "I'm getting one",
  not_sure: "I'm not sure",
};
export const GUARDIAN_CONSENT_LABEL: Record<GuardianConsentStatus, string> = {
  not_applicable: "Not applicable (18+)",
  obtained: "My parent/guardian knows and agrees",
  will_obtain: "I will get consent before starting",
};

export const SCHEDULE_TAGS = [
  { value: "weekday", label: "Weekdays" },
  { value: "weekend", label: "Weekends" },
  { value: "morning", label: "Mornings" },
  { value: "afternoon", label: "After school" },
  { value: "evening", label: "Evenings" },
  { value: "flexible", label: "Flexible" },
];

export const DAYS = [
  { key: "mon", label: "Mon" },
  { key: "tue", label: "Tue" },
  { key: "wed", label: "Wed" },
  { key: "thu", label: "Thu" },
  { key: "fri", label: "Fri" },
  { key: "sat", label: "Sat" },
  { key: "sun", label: "Sun" },
];
export const DAY_PARTS = ["morning", "afternoon", "evening"] as const;

/** Defaults. In Supabase mode these live in the platform_settings table and admins edit them. */
export const DEFAULT_SETTINGS: PlatformSettings = {
  min_worker_age: 14,
  guardian_consent_under_age: 18,
  work_permit_reminder_under_age: 18,
  require_job_approval: true,
  rules_note:
    "Work permit and guardian consent requirements depend on your age, the type of work and who is hiring. TaskTeens does not determine whether you legally need a permit. Ask your school's work permit office or visit the California Department of Industrial Relations for current rules.",
};

export const REPORT_REASONS = [
  "Unsafe or inappropriate request",
  "Asked for sensitive personal info (SSN, bank, ID)",
  "Suspected scam or fake listing",
  "Harassment or inappropriate messages",
  "Pay not received / pay dispute",
  "Discrimination",
  "Other",
];
