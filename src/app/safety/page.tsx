import { AlertOctagon, Ban, Eye, KeyRound, MapPin, MessageCircle, Phone, ShieldCheck, Users, Video } from "lucide-react";
import Link from "next/link";
import { SAFETY_EMAIL } from "@/lib/constants";

export const metadata = { title: "Safety", description: "How TaskTeens keeps teen workers safe, plus interview and meeting guidance for teens, parents and employers." };

const TEEN_RULES = [
  { icon: Users, t: "Tell a trusted adult", b: "Share the job, employer, location and schedule with a parent or guardian before you go." },
  { icon: Video, t: "Interview safely", b: "Video, phone or a public place like a library or café. You can always bring a parent or guardian." },
  { icon: KeyRound, t: "Protect your info", b: "Never share your SSN, bank login, ID numbers or passwords. TaskTeens will never ask for them." },
  { icon: Ban, t: "Never pay to work", b: "Real jobs don't charge you fees, deposits or 'training costs'. Report anyone who asks." },
  { icon: MapPin, t: "Location stays private", b: "Listings only show a city or neighborhood. Share your home address only if you're comfortable, and never publicly." },
  { icon: Eye, t: "Trust your gut", b: "If something feels off, leave, tell an adult and report it. You never owe anyone an explanation." },
];

export default function SafetyPage() {
  return (
    <div>
      <section className="bg-navy-800 text-white">
        <div className="container-page py-16">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-coral-300">Safety center</p>
          <h1 className="mt-2 max-w-3xl text-4xl font-extrabold sm:text-5xl">Safety is the product.</h1>
          <p className="mt-4 max-w-2xl text-lg text-navy-200">Most TaskTeens users are minors. Here&apos;s how the platform is designed to protect them — and what teens, parents and employers should do every time.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/report?severity=emergency" className="btn-coral btn-lg"><AlertOctagon className="h-5 w-5" aria-hidden="true" /> Emergency report</Link>
            <Link href="/report" className="btn btn-lg border border-white/30 text-white hover:bg-white/10">Report a concern</Link>
          </div>
          <p className="mt-4 flex items-center gap-2 text-sm text-navy-200"><Phone className="h-4 w-4" aria-hidden="true" /> If anyone is in immediate danger, call <strong className="text-white">911</strong> first.</p>
        </div>
      </section>

      <section className="container-page mt-16" aria-labelledby="teen-safety">
        <h2 id="teen-safety" className="text-3xl font-bold">For teens</h2>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {TEEN_RULES.map((r) => (
            <li key={r.t} className="card p-5">
              <r.icon className="h-6 w-6 text-bay-500" aria-hidden="true" />
              <h3 className="mt-3 font-semibold">{r.t}</h3>
              <p className="mt-1 text-sm leading-6 text-navy-500">{r.b}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="container-page mt-16 grid gap-8 lg:grid-cols-2" aria-label="Meeting and interview guidance">
        <div className="card p-6">
          <h2 className="flex items-center gap-2 text-2xl font-bold"><MessageCircle className="h-6 w-6 text-coral-500" aria-hidden="true" /> Meeting &amp; interview guidance</h2>
          <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-6 text-navy-600">
            <li>Use the interview request tool in TaskTeens so there&apos;s a record of the time and place.</li>
            <li>Choose video, phone or a public place during daytime hours.</li>
            <li>Parents/guardians are welcome at every interview. Employers should say so in the invitation.</li>
            <li>For in-home jobs (childcare support, yard work), a parent or guardian should visit or confirm the location before the first shift.</li>
            <li>Share an exact address only after the job is accepted — and only what&apos;s needed.</li>
            <li>Agree on pay, hours and duties in writing (an email or text message counts) before starting.</li>
          </ol>
        </div>
        <div className="card p-6">
          <h2 className="flex items-center gap-2 text-2xl font-bold"><ShieldCheck className="h-6 w-6 text-bay-500" aria-hidden="true" /> What TaskTeens does</h2>
          <ul className="mt-4 space-y-2 text-sm leading-6 text-navy-600">
            <li>• New listings are reviewed by a moderator before they go public (configurable by administrators).</li>
            <li>• Listing forms reject street addresses; application forms reject text that looks like an SSN.</li>
            <li>• Teen profiles are never public. Employers only see what a teen submits to their job.</li>
            <li>• Employers can request a profile review. The &ldquo;Verified profile&rdquo; badge appears only after an admin approves it. <strong>TaskTeens does not currently perform background checks.</strong></li>
            <li>• Report and block tools on every listing; emergency reports are prioritized in the moderation queue and emailed to the safety inbox.</li>
            <li>• Accounts can be suspended, and every admin action is recorded in an audit log.</li>
          </ul>
        </div>
      </section>

      <section className="container-page mt-16" aria-labelledby="parents">
        <div className="rounded-4xl bg-cream-200 p-8 sm:p-10">
          <h2 id="parents" className="text-2xl font-bold">For parents, guardians &amp; school staff</h2>
          <p className="mt-3 max-w-3xl text-navy-600">Work-permit and guardian-consent rules depend on a teen&apos;s age, the job and the employer. TaskTeens records a teen&apos;s self-reported status on each application but does not verify permits or determine legal requirements. Check with your school&apos;s work-permit office or the California Department of Industrial Relations for current rules.</p>
          <p className="mt-3 text-navy-600">Questions or concerns? Email <a href={`mailto:${SAFETY_EMAIL}`} className="link">{SAFETY_EMAIL}</a>.</p>
        </div>
      </section>
    </div>
  );
}
