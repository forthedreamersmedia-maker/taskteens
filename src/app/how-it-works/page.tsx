import Link from "next/link";
import { EMPLOYER_STEPS, StepList, TEEN_STEPS } from "@/components/home/steps";
import { Faq } from "@/components/home/faq";
import { APPLICATION_STATUS_LABEL } from "@/lib/constants";

export const metadata = { title: "How It Works" };

export default function HowItWorksPage() {
  return (
    <div>
      <section className="container-page py-14 text-center">
        <p className="eyebrow">How it works</p>
        <h1 className="mx-auto mt-2 max-w-3xl text-4xl font-extrabold sm:text-5xl">From “I need a job” to your first shift</h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-navy-600">TaskTeens handles the routing: every application goes straight to the right employer&apos;s dashboard, and every decision comes straight back to you.</p>
      </section>
      <section className="container-page grid gap-12 lg:grid-cols-2">
        <div>
          <h2 className="mb-4 text-2xl font-bold">For teens</h2>
          <StepList steps={TEEN_STEPS} />
          <Link href="/auth/sign-up?role=teen" className="btn-primary mt-6">Create a teen account</Link>
        </div>
        <div>
          <h2 className="mb-4 text-2xl font-bold">For employers</h2>
          <StepList steps={EMPLOYER_STEPS} accent="coral" />
          <Link href="/auth/sign-up?role=employer" className="btn-coral mt-6">Create an employer account</Link>
        </div>
      </section>
      <section className="container-page mt-16" aria-labelledby="statuses">
        <div className="card p-6 sm:p-8">
          <h2 id="statuses" className="text-2xl font-bold">Application statuses</h2>
          <p className="mt-2 text-sm text-navy-500">You get an in-app notification (and an email) whenever an employer changes your status.</p>
          <ol className="mt-6 flex flex-wrap gap-3">
            {Object.values(APPLICATION_STATUS_LABEL).map((s, i) => (
              <li key={s} className="flex items-center gap-2 rounded-full bg-cream-200 px-4 py-2 text-sm font-medium">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-navy-800 text-xs text-white">{i + 1}</span>
                {s}
              </li>
            ))}
          </ol>
        </div>
      </section>
      <Faq />
    </div>
  );
}
