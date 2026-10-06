import { describe, expect, it } from "vitest";
import { formatDuration, formatTime } from "@/lib/safety/format";
import { CONSENT_STATEMENTS, PARENT_STATUS_LABEL } from "@/lib/safety/consent";
import { jobSchema } from "@/lib/validation";

describe("safety formatting", () => {
  it("formats times and durations", () => {
    expect(formatTime("09:05")).toBe("9:05 AM");
    expect(formatTime("14:30:00")).toBe("2:30 PM");
    expect(formatDuration(90)).toBe("1 hr 30 min");
  });
  it("parent status labels never claim age or identity verification", () => {
    for (const l of Object.values(PARENT_STATUS_LABEL)) expect(l).not.toMatch(/verified/i);
    expect(PARENT_STATUS_LABEL.confirmed).toBe("Parent confirmed");
    expect(CONSENT_STATEMENTS.some((s) => /does not run background checks/.test(s.text))).toBe(true);
  });
});

const job = {
  title: "Rake leaves", opportunity_type: "job", nonprofit_attested: false, category: "yard-work",
  description: "Rake and bag leaves in the backyard while I am in the yard with you.", responsibilities: ["Rake"],
  required_skills: [], preferred_skills: [], city: "Berkeley", neighborhood: null, service_area: "berkeley", work_mode: "in_person",
  pay_type: "hourly", pay_min: 20, pay_max: null, schedule: "Sat", schedule_tags: [], min_age: 14, start_date: "2026-11-01",
  recurrence: "one_time", openings: 1, deadline: null, transportation: "bike_or_walk", transportation_notes: null,
};

describe("job publishing requirements (§6)", () => {
  it("drafts don't need safety details", () => {
    expect(jobSchema.safeParse({ ...job, status: "draft" }).success).toBe(true);
  });
  it("published listings need date, time, duration, setting, supervision, equipment, risks and address", () => {
    const r = jobSchema.safeParse({ ...job, status: "published" });
    expect(r.success).toBe(false);
    const paths = r.success ? [] : r.error.issues.map((i) => i.path[0]);
    for (const k of ["start_time", "duration_minutes", "work_setting", "supervision", "equipment", "known_risks", "address_id"]) expect(paths).toContain(k);
  });
  it("indoor work requires an adult present", () => {
    const r = jobSchema.safeParse({ ...job, status: "published", start_time: "10:00", duration_minutes: 60, work_setting: "indoor_adult_present", supervision: "My teenager will be home", equipment: "None", known_risks: "None known", address_id: "00000000-0000-4000-8000-000000000001" });
    expect(r.success).toBe(false);
  });
  it("a complete listing passes", () => {
    const r = jobSchema.safeParse({ ...job, status: "published", start_time: "10:00", duration_minutes: 60, work_setting: "outdoor", supervision: "Adult homeowner in the yard", equipment: "Rakes provided", known_risks: "None known", address_id: "00000000-0000-4000-8000-000000000001" });
    expect(r.success).toBe(true);
  });
});
