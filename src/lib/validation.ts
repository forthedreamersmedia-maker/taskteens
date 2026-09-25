import { z } from "zod";

const phoneRegex = /^[+()\-.\s\d]{10,20}$/;

/** Detects obvious sensitive identifiers that should never be collected. */
const SSN_PATTERN = /\b\d{3}-?\d{2}-?\d{4}\b/;
export function containsSensitiveNumber(text: string) {
  return SSN_PATTERN.test(text);
}
const noSensitive = (label: string) =>
  z
    .string()
    .refine((v) => !containsSensitiveNumber(v), {
      message: `Please remove anything that looks like a Social Security or ID number from ${label}. TaskTeens never needs it.`,
    });

export const applicationSchema = z
  .object({
    job_id: z.string().min(1),
    applicant_name: z.string().trim().min(2, "Enter your first and last name.").max(80),
    age_range: z.enum(["14-15", "16-17", "18-19"], { errorMap: () => ({ message: "Choose your age range." }) }),
    city: z.string().trim().min(2, "Enter the city you live in (no street address)."),
    applicant_email: z.string().trim().email("Enter a valid email address."),
    applicant_phone: z.string().trim().regex(phoneRegex, "Enter a valid phone number, e.g. (510) 555-0123."),
    experience: noSensitive("your experience").pipe(z.string().trim().min(10, "Tell the employer a little about your experience (at least 10 characters). School, clubs and volunteering count!").max(1500)),
    skills: z.array(z.string()).min(1, "Add at least one skill."),
    availability: z.string().trim().min(3, "Tell the employer when you're available.").max(500),
    transportation: z.enum(["none_needed", "transit_accessible", "bike_or_walk", "own_transportation", "employer_provides"], {
      errorMap: () => ({ message: "Choose how you'd get to this job." }),
    }),
    interest_statement: noSensitive("your response").pipe(z.string().trim().min(30, "Write at least 30 characters about why you're interested.").max(1200)),
    portfolio_url: z
      .string()
      .trim()
      .optional()
      .refine((v) => !v || /^https?:\/\/.+\..+/.test(v), "Portfolio link must start with http:// or https://"),
    work_permit_status: z.enum(["not_required", "have_permit", "in_progress", "not_sure"], {
      errorMap: () => ({ message: "Choose your work-permit status." }),
    }),
    guardian_consent_status: z.enum(["not_applicable", "obtained", "will_obtain"], {
      errorMap: () => ({ message: "Choose your guardian-consent status." }),
    }),
    agreed_to_safety_rules: z.literal(true, { errorMap: () => ({ message: "You must agree to the TaskTeens safety rules to apply." }) }),
  })
  .superRefine((v, ctx) => {
    if (v.age_range !== "18-19" && v.guardian_consent_status === "not_applicable") {
      ctx.addIssue({ code: "custom", path: ["guardian_consent_status"], message: "Applicants under 18 need to confirm guardian consent status." });
    }
  });

export const jobSchema = z
  .object({
    title: z.string().trim().min(5, "Title should be at least 5 characters.").max(90),
    category: z.string().min(1, "Choose a category."),
    description: z.string().trim().min(40, "Describe the job in at least 40 characters.").max(4000),
    responsibilities: z.array(z.string().trim().min(1)).min(1, "Add at least one responsibility."),
    required_skills: z.array(z.string()).default([]),
    preferred_skills: z.array(z.string()).default([]),
    city: z.string().min(1, "Choose a city."),
    neighborhood: z
      .string()
      .trim()
      .max(60)
      .nullable()
      .refine((v) => !v || !/\d{2,5}\s+\w+\s+(st|street|ave|avenue|rd|road|blvd|way|dr|drive|ct|court|ln|lane)\b/i.test(v), {
        message: "Use a neighborhood or cross-streets — never an exact street address.",
      }),
    service_area: z.string().min(1),
    work_mode: z.enum(["in_person", "remote", "hybrid"]),
    pay_type: z.enum(["hourly", "flat", "stipend"]),
    pay_min: z.coerce.number({ invalid_type_error: "Enter pay." }).positive("Pay must be greater than $0."),
    pay_max: z.coerce.number().nullable(),
    schedule: z.string().trim().min(3, "Describe the schedule."),
    schedule_tags: z.array(z.string()).default([]),
    min_age: z.coerce.number().int().min(14, "Minimum age on TaskTeens is 14.").max(19),
    start_date: z.string().nullable(),
    recurrence: z.enum(["one_time", "recurring"]),
    openings: z.coerce.number().int().min(1, "At least 1 opening.").max(50),
    deadline: z.string().nullable(),
    transportation: z.enum(["none_needed", "transit_accessible", "bike_or_walk", "own_transportation", "employer_provides"]),
    transportation_notes: z.string().nullable(),
    status: z.enum(["draft", "published", "paused", "closed", "removed"]),
  })
  .superRefine((v, ctx) => {
    if (v.pay_max != null && v.pay_max !== 0 && v.pay_max < v.pay_min) {
      ctx.addIssue({ code: "custom", path: ["pay_max"], message: "Max pay can't be lower than min pay." });
    }
  });

/** Soft warning only — minimum-wage rules vary by city, employer type and job; employers must verify. */
export const LOW_HOURLY_WARNING_THRESHOLD = 17;

export const signUpSchema = z.object({
  full_name: z.string().trim().min(2, "Enter your name."),
  email: z.string().trim().email("Enter a valid email."),
  password: z
    .string()
    .min(8, "Use at least 8 characters.")
    .regex(/[A-Za-z]/, "Include at least one letter.")
    .regex(/\d/, "Include at least one number."),
  role: z.enum(["teen", "employer"], { errorMap: () => ({ message: "Choose an account type." }) }),
  agree: z.literal(true, { errorMap: () => ({ message: "You must accept the Terms and Community Guidelines." }) }),
  age_confirm: z.boolean().optional(),
});

export const employerOnboardingSchema = z.object({
  employer_type: z.enum(["individual", "business"]),
  display_name: z.string().trim().min(2, "Enter a name or business name.").max(80),
  phone: z.string().trim().regex(phoneRegex, "Enter a valid phone number."),
  city: z.string().min(1, "Choose your city."),
  service_area: z.string().min(1, "Choose a service area."),
  website: z
    .string()
    .trim()
    .refine((v) => !v || /^https?:\/\/.+\..+/.test(v), "Link must start with http:// or https://"),
  description: z.string().trim().min(20, "Add a short description (20+ characters).").max(1000),
  request_verification: z.boolean(),
  legal_name: z.string().trim(),
  business_registration: z.string().trim(),
  verification_notes: z.string().trim().max(1000),
  agreed_to_rules: z.literal(true, { errorMap: () => ({ message: "You must agree to the employer safety and conduct rules." }) }),
}).superRefine((v, ctx) => {
  if (v.request_verification && v.legal_name.length < 2) {
    ctx.addIssue({ code: "custom", path: ["legal_name"], message: "Enter your legal or registered business name for review." });
  }
});

export const reportSchema = z.object({
  target_type: z.enum(["job", "user", "application", "review", "other"]),
  target_id: z.string().nullable(),
  reason: z.string().min(1, "Choose a reason."),
  details: z.string().trim().min(10, "Please describe what happened (10+ characters).").max(4000),
  severity: z.enum(["normal", "urgent", "emergency"]),
  contact_email: z.string().trim().email("Enter a valid email").or(z.literal("")).nullable(),
});

/** Flattens a ZodError into { field: message } (first message per field). */
export function fieldErrors(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join(".") || "_form";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
