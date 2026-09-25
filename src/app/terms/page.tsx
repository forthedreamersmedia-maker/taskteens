import { LegalPage } from "@/components/layout/legal-page";
import { LegalDoc, LegalToc } from "@/components/layout/legal-doc";
import { CONTACT_EMAIL } from "@/lib/constants";
import { TERMS, TERMS_EFFECTIVE, TERMS_UPDATED } from "@/content/terms";

export const metadata = { title: "Terms of Use" };

export default function TermsPage() {
  const source = TERMS.replaceAll("{{EMAIL}}", CONTACT_EMAIL);
  return (
    <LegalPage title="TaskTeens Terms of Use" effective={TERMS_EFFECTIVE} updated={TERMS_UPDATED} toc={<LegalToc source={source} />}>
      <LegalDoc source={source} />
    </LegalPage>
  );
}
