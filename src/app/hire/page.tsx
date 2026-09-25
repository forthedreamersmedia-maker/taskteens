import { BadgeCheck, CheckCircle2, ClipboardCheck, Inbox, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { EMPLOYER_STEPS, StepList } from "@/components/home/steps";
import { SafeImage } from "@/components/ui/image";
import { IMAGES } from "@/lib/constants";

export const metadata = { title: "Hire Teens", description: "Post a job and hire motivated local teens in Berkeley, Albany, El Cerrito and the East Bay." };

export default function HirePage() {
  return (
    <div>
      <section className="container-page grid items-center gap-10 py-14 lg:grid-cols-2 lg:py-20">
        <div>
          <p className="eyebrow">For families &amp; small businesses</p>
          <h1 className="mt-2 text-4xl font-extrabold sm:text-5xl">Hire a motivated local teen — without the inbox chaos.</h1>
          <p className="mt-5 text-lg text-navy-600">Post a clear listing, and applications arrive in your TaskTeens dashboard automatically. Review, request interviews and make a decision — applicants are notified at every step.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/auth/sign-up?role=employer&next=/dashboard/employer/listings/new" className="btn-coral btn-lg">Post a Job</Link>
            <Link href="/auth/sign-in?next=/dashboard/employer" className="btn-outline btn-lg">Employer sign in</Link>
          </div>
        </div>
        <SafeImage src={IMAGES.employer} alt="Local business owner training a young employee" className="h-80 w-full rounded-4xl shadow-lift" />
      </section>

      <section className="container-page mt-6" aria-labelledby="emp-steps">
        <h2 id="emp-steps" className="text-3xl font-bold">How hiring works</h2>
        <div className="mt-6"><StepList steps={EMPLOYER_STEPS} accent="coral" /></div>
      </section>

      <section className="container-page mt-16 grid gap-6 md:grid-cols-3" aria-label="Employer tools">
        {[
          { icon: ClipboardCheck, t: "Listing tools", b: "Draft, publish, pause, close or delete listings. Upload a cover photo. Edit anytime." },
          { icon: Inbox, t: "Applicant dashboard", b: "Applicants grouped by job, filters by status, private notes, interview requests and one-click decisions." },
          { icon: ShieldCheck, t: "Built-in safeguards", b: "Approximate locations only, no sensitive data collection, and clear conduct rules keep everyone protected." },
        ].map((x) => (
          <div key={x.t} className="card p-6">
            <x.icon className="h-6 w-6 text-coral-500" aria-hidden="true" />
            <h3 className="mt-3 font-semibold">{x.t}</h3>
            <p className="mt-1 text-sm leading-6 text-navy-500">{x.b}</p>
          </div>
        ))}
      </section>

      <section id="verification" className="container-page mt-16 scroll-mt-24" aria-labelledby="verif">
        <div className="grid gap-8 rounded-4xl bg-white p-8 shadow-card ring-1 ring-navy-100 lg:grid-cols-2">
          <div>
            <h2 id="verif" className="flex items-center gap-2 text-2xl font-bold"><BadgeCheck className="h-6 w-6 text-bay-500" aria-hidden="true" /> Profile verification</h2>
            <p className="mt-3 text-navy-600">During onboarding you can request a profile review. A TaskTeens administrator checks the information you submit (for example, your registered business name or website). When approved, a &ldquo;Verified profile&rdquo; badge appears on your listings.</p>
            <p className="mt-3 text-sm text-navy-500">This is a manual profile review, not a background check or legal verification. TaskTeens has not integrated a third-party verification provider in this version.</p>
          </div>
          <div>
            <h3 className="font-semibold">Employer commitments</h3>
            <ul className="mt-3 space-y-2 text-sm text-navy-600">
              {["Follow labor laws for minors (hours, breaks, permitted tasks, minimum wage).", "Interview by video, phone or in public; parents welcome.", "Never request SSNs, bank logins, ID numbers or fees.", "Keep exact addresses private until a hire is confirmed.", "Update applicants promptly."].map((c) => (
                <li key={c} className="flex gap-2"><CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" aria-hidden="true" /> {c}</li>
              ))}
            </ul>
            <Link href="/guidelines#employers" className="link mt-4 inline-block text-sm">Read the full employer rules</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
