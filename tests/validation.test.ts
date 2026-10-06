import { describe, expect, it } from "vitest";
import { applicationSchema } from "@/lib/validation";

const base = {
  job_id: "job_1",
  applicant_name: "Maya Rodriguez",
  age_range: "16-17",
  city: "Albany",
  experience: "I help my neighbors with their gardens every summer.",
  skills: ["Gardening"],
  availability: "Saturday mornings",
  transportation: "bike_or_walk",
  interest_statement: "I enjoy outdoor work and want to earn money for college.",
  work_permit_status: "not_sure",
  guardian_consent_status: "will_obtain",
  agreed_to_safety_rules: true,
};

describe("application validation", () => {
  it("accepts an application without any teen contact details", () => {
    const r = applicationSchema.safeParse(base);
    expect(r.success).toBe(true);
  });
  it("does not pass teen email or phone through to the application", () => {
    const r = applicationSchema.safeParse({ ...base, applicant_email: "maya@example.com", applicant_phone: "5105550142" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data).not.toHaveProperty("applicant_email");
      expect(r.data).not.toHaveProperty("applicant_phone");
    }
  });
});
