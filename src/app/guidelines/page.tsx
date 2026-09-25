import { LegalPage } from "@/components/layout/legal-page";

export const metadata = { title: "Community Guidelines" };

export default function GuidelinesPage() {
  return (
    <LegalPage title="Community Guidelines" updated="September 2026" intro="TaskTeens works because teens, families and local businesses treat each other with respect. These rules apply to everyone.">
      <h2 id="everyone">For everyone</h2>
      <ul>
        <li>Be honest, respectful and professional in every message and meeting.</li>
        <li>No harassment, discrimination, threats, or sexual or romantic messages — ever.</li>
        <li>Keep communication about the job. Don&apos;t move conversations to private social media.</li>
        <li>Report anything that seems unsafe, dishonest or inappropriate.</li>
      </ul>
      <h2 id="employers">For employers</h2>
      <ul>
        <li>Post real jobs with clear pay, hours and duties. No &ldquo;pay to start,&rdquo; commission-only or multi-level-marketing listings.</li>
        <li>Never ask for a Social Security number, bank login, government ID number or money through TaskTeens.</li>
        <li>Interviews must be over video, by phone or in a public place. Welcome a parent or guardian if the teen wants one.</li>
        <li>Share an exact work address only after you&apos;ve selected an applicant and they&apos;ve accepted, and only as needed.</li>
        <li>Follow all applicable laws for employing minors, including hours, breaks and prohibited tasks.</li>
        <li>An adult should be present or reachable for in-home jobs.</li>
        <li>Update application statuses promptly so teens aren&apos;t left waiting.</li>
      </ul>
      <h2 id="teens">For teens</h2>
      <ul>
        <li>Apply only to jobs you can realistically do and show up for.</li>
        <li>Tell a parent or guardian where you&apos;re going and when.</li>
        <li>Communicate early if you need to cancel or can&apos;t make a shift.</li>
      </ul>
      <h2 id="enforcement">Enforcement</h2>
      <p>Violations may lead to listing removal, account suspension or permanent bans. Serious safety concerns may be referred to law enforcement.</p>
    </LegalPage>
  );
}
