export type AddressStatus = "submitted" | "standardized" | "pending_review" | "reviewed" | "possession_confirmed" | "rejected";

export const ADDRESS_STATUS_LABEL: Record<AddressStatus, string> = {
  submitted: "Submitted",
  standardized: "Standardized — pending admin review",
  pending_review: "Pending admin review",
  reviewed: "Admin reviewed",
  possession_confirmed: "Possession confirmed",
  rejected: "Rejected",
};

export interface TrustIndicators {
  employer_id: string; email_confirmed: boolean; phone_confirmed: boolean; address_reviewed: boolean; address_possession_confirmed: boolean; manually_reviewed: boolean;
}

export const INDICATOR_LABELS: { key: keyof Omit<TrustIndicators, "employer_id">; label: string }[] = [
  { key: "email_confirmed", label: "Email confirmed" },
  { key: "phone_confirmed", label: "Phone confirmed" },
  { key: "address_reviewed", label: "Address reviewed" },
  { key: "address_possession_confirmed", label: "Address possession confirmed" },
  { key: "manually_reviewed", label: "Manually reviewed" },
];
