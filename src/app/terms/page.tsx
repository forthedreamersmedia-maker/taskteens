import Link from "next/link";
import { LegalPage } from "@/components/layout/legal-page";

export const metadata = { title: "Terms of Use" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Use" updated="September 2026">
      <h2>1. What TaskTeens is</h2>
      <p>TaskTeens is an online platform that lets local employers post job listings and lets teen workers apply to them. TaskTeens is not an employer, staffing agency or party to any work arrangement between users. [Counsel to confirm classification and any licensing requirements.]</p>
      <h2>2. Eligibility</h2>
      <ul>
        <li>Teen workers must be at least the platform minimum age (currently configured as 14) and should have a parent or guardian&apos;s permission.</li>
        <li>Employers must be adults (18+) and provide accurate information.</li>
      </ul>
      <h2>3. Employer responsibilities</h2>
      <ul>
        <li>Comply with all applicable labor laws, including minimum wage, work-hour limits for minors, work-permit requirements and prohibited occupations for minors.</li>
        <li>Post honest listings with accurate pay, schedules and duties.</li>
        <li>Never request Social Security numbers, bank logins, government ID numbers or payment from applicants through TaskTeens.</li>
        <li>Follow the <Link href="/guidelines" className="link">Community Guidelines</Link> and interview safety rules.</li>
      </ul>
      <h2>4. Teen responsibilities</h2>
      <ul>
        <li>Provide truthful application information.</li>
        <li>Follow the safety rules and tell a parent or guardian about any job.</li>
      </ul>
      <h2>5. Verification</h2>
      <p>A &ldquo;Verified profile&rdquo; badge means a TaskTeens administrator reviewed information an employer submitted. It is <strong>not</strong> a background check, license check or guarantee of safety or conduct.</p>
      <h2>6. Moderation</h2>
      <p>We may review, pause or remove listings and suspend accounts that violate these Terms or put users at risk. Administrative actions are logged.</p>
      <h2>7. Disclaimers &amp; limitation of liability</h2>
      <p>[Placeholder — requires attorney drafting.]</p>
      <h2>8. Changes</h2>
      <p>We may update these Terms. We&apos;ll notify users of material changes.</p>
    </LegalPage>
  );
}
