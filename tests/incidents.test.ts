import { describe, expect, it } from "vitest";
import { CLOSED, EVIDENCE_TYPES, INCIDENT_CATEGORIES, STATUS_LABEL, categoryLabel, uploadEvidence } from "../src/lib/safety/incidents";

const fakeSb = { storage: { from: () => { throw new Error("should not upload"); } }, rpc: () => { throw new Error("should not register"); } } as never;
const file = (type: string, size: number) => ({ name: "x", type, size, lastModified: 0, arrayBuffer: async () => new ArrayBuffer(0) }) as unknown as File;

describe("incident helpers", () => {
  it("labels every category and status the database allows", () => {
    for (const c of ["safety_emergency", "missing_person", "lost_pet", "injury", "property_damage", "harassment", "payment_dispute", "job_different", "other"])
      expect(INCIDENT_CATEGORIES.some((x) => x.id === c)).toBe(true);
    for (const s of ["open", "urgent", "awaiting_response", "referred", "substantiated", "unsubstantiated", "inconclusive", "resolved"])
      expect(STATUS_LABEL[s]).toBeTruthy();
    expect(categoryLabel("lost_pet")).toMatch(/pet/i);
    expect(CLOSED.has("resolved") && !CLOSED.has("urgent")).toBe(true);
  });
  it("rejects disallowed file types before uploading", async () => {
    await expect(uploadEvidence(fakeSb, "u", file("application/x-msdownload", 10), { phase: "incident", incidentId: "i" })).rejects.toThrow(/only photos/);
  });
  it("rejects files over 25 MB before uploading", async () => {
    await expect(uploadEvidence(fakeSb, "u", file("image/jpeg", 26 * 1024 * 1024), { phase: "incident", incidentId: "i" })).rejects.toThrow(/25 MB/);
  });
  it("matches the storage bucket's allowed types", () => {
    expect(EVIDENCE_TYPES).toEqual(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "video/mp4", "video/quicktime", "application/pdf"]);
  });
});
