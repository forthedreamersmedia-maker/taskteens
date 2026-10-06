import "server-only";

export interface AddressSummary { provider: "google"; deliverable: boolean; formatted: string | null; granularity: string | null; issues: string[] }

export function addressProviderConfigured(): boolean {
  return !!process.env.GOOGLE_ADDRESS_VALIDATION_API_KEY;
}

/**
 * Google Address Validation API. Returns a short summary only (no raw provider payload is stored).
 * Returns null when the provider isn't configured — the address then goes straight to manual review.
 * Standardization is an indicator; it never proves that someone lives at an address.
 */
export async function standardizeAddress(a: { line1: string; line2?: string | null; city: string; state: string; postal_code: string }): Promise<AddressSummary | null> {
  const key = process.env.GOOGLE_ADDRESS_VALIDATION_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(`https://addressvalidation.googleapis.com/v1:validateAddress?key=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address: { regionCode: "US", administrativeArea: a.state, locality: a.city, postalCode: a.postal_code, addressLines: [a.line1, a.line2].filter(Boolean) }, enableUspsCass: true }),
    });
    if (!res.ok) return { provider: "google", deliverable: false, formatted: null, granularity: null, issues: [`provider_error_${res.status}`] };
    const j = (await res.json()) as {
      result?: { verdict?: { addressComplete?: boolean; validationGranularity?: string; hasUnconfirmedComponents?: boolean; hasInferredComponents?: boolean; hasReplacedComponents?: boolean }; address?: { formattedAddress?: string }; uspsData?: { dpvConfirmation?: string } };
    };
    const v = j.result?.verdict ?? {};
    const issues: string[] = [];
    if (!v.addressComplete) issues.push("incomplete");
    if (v.hasUnconfirmedComponents) issues.push("unconfirmed_components");
    if (v.hasReplacedComponents) issues.push("replaced_components");
    const dpv = j.result?.uspsData?.dpvConfirmation;
    if (dpv && dpv !== "Y") issues.push(`usps_dpv_${dpv}`);
    const deliverable = !!v.addressComplete && !v.hasUnconfirmedComponents && ["PREMISE", "SUB_PREMISE"].includes(v.validationGranularity ?? "") && (!dpv || dpv === "Y");
    return { provider: "google", deliverable, formatted: j.result?.address?.formattedAddress ?? null, granularity: v.validationGranularity ?? null, issues };
  } catch {
    return { provider: "google", deliverable: false, formatted: null, granularity: null, issues: ["provider_unreachable"] };
  }
}
