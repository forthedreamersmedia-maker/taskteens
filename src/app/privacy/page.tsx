import { LegalPage } from "@/components/layout/legal-page";
import { CONTACT_EMAIL } from "@/lib/constants";

export const metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="September 2026" intro="TaskTeens is used by teenagers, many of whom are minors. We collect as little personal information as possible and only use it to help teens find and apply for local work.">
      <h2>1. Information we collect</h2>
      <h3>Teen accounts</h3>
      <ul>
        <li>Account details: name, email address, password (stored hashed by our authentication provider).</li>
        <li>Profile details you choose to add: age range (not exact birth date), city, skills, experience, availability, transportation, portfolio link and résumé file.</li>
        <li>Application details you submit to a specific employer, including a contact phone number.</li>
        <li>Work-permit and guardian-consent <em>status</em> (a self-reported answer, not documents).</li>
      </ul>
      <h3>Employer accounts</h3>
      <ul>
        <li>Name or business name, email, phone, city/service area, website and a short description.</li>
        <li>Information submitted for an optional profile review (for example, a registered business name).</li>
      </ul>
      <h3>What we never ask for</h3>
      <ul>
        <li>Social Security numbers, bank or payment credentials, government ID numbers, exact home addresses or school schedules.</li>
      </ul>
      <h2>2. How information is shared</h2>
      <ul>
        <li>Your public profile is <strong>not</strong> publicly listed. Employers see your information only when you apply to their job, and only what is on that application.</li>
        <li>Job listings show only a city or approximate neighborhood.</li>
        <li>Service providers that operate the platform (hosting, database, email delivery) process data on our behalf.</li>
        <li>We may disclose information if required by law or to protect someone&apos;s safety.</li>
        <li>We do not sell personal information and do not show third-party advertising.</li>
      </ul>
      <h2>3. Minors</h2>
      <p>TaskTeens accounts are intended for people aged 14 and older. We do not knowingly collect personal information from children under 13. [Counsel to review COPPA, California CCPA/CPRA and the California Age-Appropriate Design Code requirements and update this section.]</p>
      <h2>4. Your choices</h2>
      <ul>
        <li>Edit or remove profile information and résumés at any time from your dashboard.</li>
        <li>Withdraw an application; employers will see it as withdrawn.</li>
        <li>Turn off non-essential email notifications in settings.</li>
        <li>Request account deletion from Settings or by emailing {CONTACT_EMAIL}.</li>
      </ul>
      <h2>5. Security</h2>
      <p>Data is protected with row-level database security so each user can access only their own records, encrypted connections and role-based administrator access. No system is perfectly secure.</p>
      <h2>6. Retention</h2>
      <p>[Placeholder: define how long applications, reports and audit logs are retained after an account is closed.]</p>
      <h2>7. Contact</h2>
      <p>Questions? Email {CONTACT_EMAIL}.</p>
    </LegalPage>
  );
}
