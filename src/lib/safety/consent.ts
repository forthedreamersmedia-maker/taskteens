/**
 * Parent/guardian consent text. Changing any statement requires a new CONSENT_VERSION —
 * the version and the exact statements a parent accepted are stored with each consent record.
 */
export const CONSENT_VERSION = "2026-10-pilot-v1";

export const CONSENT_STATEMENTS: { id: string; text: string }[] = [
  { id: "parent_or_guardian", text: "I am this teen's parent or legal guardian." },
  { id: "allow_applying", text: "I allow my teen to use TaskTeens to find and apply for local household jobs during the pilot." },
  { id: "approve_each_job", text: "I understand I must approve each specific job before it is confirmed, and that the exact address is shared only after I approve." },
  { id: "no_background_checks", text: "I understand TaskTeens does not run background checks and does not verify anyone's identity or age. Employer indicators show only the specific steps listed." },
  { id: "parent_visibility", text: "I understand I can read every message between my teen and employers, and that I can pause my teen's account or withdraw consent at any time." },
  { id: "emergencies", text: "I understand TaskTeens is not an emergency service. In an emergency, call 911." },
  { id: "draft_terms", text: "I have read the Terms of Service and Privacy Policy (pilot drafts)." },
];

export const LOCATION_CONSENT_TEXT =
  "Optional: allow my teen to share their live location with me during a confirmed job. Sharing only happens when my teen turns it on, only I can see it, and it stops automatically when the job ends. TaskTeens does not keep a location history.";

export type ParentLinkStatus = "none" | "invited" | "confirmed" | "paused" | "revoked";

/** Truthful labels — never "age verified" or "identity verified". */
export const PARENT_STATUS_LABEL: Record<ParentLinkStatus, string> = {
  none: "No parent or guardian linked",
  invited: "Invitation sent — waiting for your parent",
  confirmed: "Parent confirmed",
  paused: "Paused by your parent",
  revoked: "Parent consent withdrawn",
};
