import { LegalPage } from "@/components/layout/legal-page";
import { LegalDoc, LegalToc } from "@/components/layout/legal-doc";
import { CONTACT_EMAIL } from "@/lib/constants";
import { PRIVACY, PRIVACY_EFFECTIVE, PRIVACY_INTRO, PRIVACY_UPDATED } from "@/content/privacy";

export const metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  const source = PRIVACY.replaceAll("{{EMAIL}}", CONTACT_EMAIL);
  return (
    <LegalPage title="TaskTeens Privacy Policy" effective={PRIVACY_EFFECTIVE} updated={PRIVACY_UPDATED} intro={PRIVACY_INTRO} toc={<LegalToc source={source} />}>
      <LegalDoc source={source} />
    </LegalPage>
  );
}
