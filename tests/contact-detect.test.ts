import { describe, expect, it } from "vitest";
import { checkContact } from "@/lib/safety/contact-detect";

describe("contact detection preview (§8)", () => {
  it("blocks phone numbers, including spelled-out digits", () => {
    expect(checkContact("call 510-555-1234").blocked).toContain("a phone number");
    expect(checkContact("five one oh five five five one two three four").blocked).toContain("a phone number");
  });
  it("blocks emails, including obfuscated ones", () => {
    expect(checkContact("maya at gmail dot com").blocked).toContain("an email address");
  });
  it("blocks handles and addresses before approval", () => {
    expect(checkContact("follow @maya_rocks").blocked).toContain("a social media handle");
    expect(checkContact("come to 123 Cedar St").blocked).toContain("a street address");
    expect(checkContact("come to 123 Cedar St", { addressAllowed: true }).blocked).toEqual([]);
  });
  it("flags softer off-platform attempts", () => {
    expect(checkContact("just text me").flagged.length).toBeGreaterThan(0);
    expect(checkContact("add me on snapchat").flagged.length).toBeGreaterThan(0);
  });
  it("leaves normal messages alone", () => {
    expect(checkContact("See you Saturday at 10! Bring gloves.")).toEqual({ blocked: [], flagged: [] });
  });
});
