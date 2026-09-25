import { ArrowRight, BadgeCheck, EyeOff, Flag, MapPin, MessageSquareWarning, ShieldCheck, Users } from "lucide-react";
import Link from "next/link";
import { JobSearchBar } from "@/components/jobs/search-bar";
import { FeaturedJobs } from "@/components/home/featured-jobs";
import { Faq } from "@/components/home/faq";
import { EMPLOYER_STEPS, StepList, TEEN_STEPS } from "@/components/home/steps";
import { CategoryIcon } from "@/components/ui/icons";
import { SafeImage } from "@/components/ui/image";
import { CATEGORIES, IMAGES, SERVICE_AREAS } from "@/lib/constants";

const SAFETY_POINTS = [
  { icon: EyeOff, title: "Private by default", body: "Listings show only a city or neighborhood. Teen contact info goes only to employers you apply to." },
  { icon: Users, title: "Public-place interviews", body: "Interviews are video, phone or in a public place — and a parent or guardian is always welcome." },
  { icon: BadgeCheck, title: "Honest verification", body: "“Verified profile” appears only after an admin review. We never imply a background check we didn't run." },
  { icon: MessageSquareWarning, title: "No sensitive asks", body: "Employers may not request SSNs, bank logins or ID numbers through TaskTeens. Forms block obvious attempts." },
  { icon: Flag, title: "Report & block", body: "Report any listing or user in two clicks. Emergency reports go to the top of the moderation queue." },
  { icon: ShieldCheck, title: "Human moderation", body: "New listings are reviewed before going live, and every admin action is recorded in an audit log." },
];

export default function HomePage() {
  return (
    <>
      {/* Hero — Bay Area photo background */}
      <section className="relative isolate overflow-hidden bg-navy-900 text-white">
        <picture>
          <source media="(max-width: 768px)" srcSet="/hero-bay-sm.jpg" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/hero-bay.jpg" alt="View of the San Francisco skyline across the Bay from the East Bay hills" className="absolute inset-0 -z-20 h-full w-full object-cover object-[center_35%]" fetchPriority="high" />
        </picture>
        <div aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-r from-navy-900/85 via-navy-900/50 to-navy-900/10" />
        <div aria-hidden="true" className="absolute inset-x-0 bottom-0 -z-10 h-40 bg-gradient-to-t from-navy-900/70 to-transparent" />
        <div className="container-page relative grid items-center gap-12 pb-20 pt-14 lg:grid-cols-[1.15fr_1fr] lg:pb-28 lg:pt-24">
          <div className="animate-fade-up">
            <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white ring-1 ring-white/25 backdrop-blur">
              <MapPin className="h-3.5 w-3.5 text-coral-300" aria-hidden="true" /> Berkeley · Albany · El Cerrito · East Bay
            </p>
            <h1 className="mt-5 text-4xl font-extrabold leading-[1.05] text-white drop-shadow-sm sm:text-5xl lg:text-6xl">
              Local jobs. <span className="text-bay-300">Real experience.</span> <span className="relative whitespace-nowrap">Built for teens.<svg aria-hidden="true" viewBox="0 0 300 12" className="absolute -bottom-2 left-0 h-3 w-full text-coral-400"><path d="M2 9c60-6 140-8 296-3" stroke="currentColor" strokeWidth="4" fill="none" strokeLinecap="round" /></svg></span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-white/85">
              TaskTeens connects East Bay teenagers with neighborhood families and small businesses who need a hand — tutoring, pet care, café shifts, yard work, tech help and more. Clear pay, clear schedules, safety built in.
            </p>
            <JobSearchBar className="mt-8 text-navy-800" />
            <div className="mt-5 flex flex-wrap items-center gap-3 text-sm">
              <Link href="/auth/sign-up?role=teen" className="btn bg-white text-navy-800 hover:bg-cream-100">I&apos;m a teen — create a profile</Link>
              <Link href="/hire" className="btn text-white hover:bg-white/10">
                I want to hire <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </div>
          <div className="relative hidden h-[26rem] lg:block" aria-hidden="true">
            <div className="absolute right-0 top-6 w-72 animate-fade-up rounded-3xl bg-white/95 p-5 text-navy-800 shadow-lift backdrop-blur [animation-delay:200ms]">
              <p className="text-xs font-semibold uppercase tracking-wider text-coral-600">Application sent</p>
              <p className="mt-1 font-semibold">After-school dog walker</p>
              <p className="text-sm text-navy-500">Delivered to the employer&apos;s dashboard</p>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-navy-50"><div className="h-full w-2/3 rounded-full bg-bay-500" /></div>
            </div>
            <div className="absolute bottom-8 left-8 w-64 animate-fade-up rounded-3xl bg-white/95 p-5 text-navy-800 shadow-lift backdrop-blur [animation-delay:450ms]">
              <p className="text-xs font-semibold uppercase tracking-wider text-bay-600">Status update</p>
              <p className="mt-1 font-semibold">Interview requested</p>
              <p className="text-sm text-navy-500">Video call · parent welcome</p>
            </div>
          </div>
        </div>
      </section>

      <FeaturedJobs />

      {/* How it works */}
      <section className="container-page mt-24" aria-labelledby="how-heading">
        <div className="max-w-2xl">
          <p className="eyebrow">How it works</p>
          <h2 id="how-heading" className="mt-2 text-3xl font-bold sm:text-4xl">Simple for teens. Straightforward for employers.</h2>
        </div>
        <div className="mt-10 grid gap-10 lg:grid-cols-2">
          <div>
            <h3 className="mb-4 flex items-center gap-2 text-xl font-bold"><span className="h-2.5 w-2.5 rounded-full bg-bay-500" aria-hidden="true" /> For teens</h3>
            <StepList steps={TEEN_STEPS} />
          </div>
          <div>
            <h3 className="mb-4 flex items-center gap-2 text-xl font-bold"><span className="h-2.5 w-2.5 rounded-full bg-coral-500" aria-hidden="true" /> For employers</h3>
            <StepList steps={EMPLOYER_STEPS} accent="coral" />
          </div>
        </div>
      </section>

      {/* Trust & safety */}
      <section className="mt-24 bg-navy-800 py-20 text-white" aria-labelledby="safety-heading">
        <div className="container-page">
          <div className="grid gap-10 lg:grid-cols-[1fr_1.5fr]">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-coral-300">Trust &amp; safety</p>
              <h2 id="safety-heading" className="mt-2 text-3xl font-bold sm:text-4xl">Designed for users who are often minors</h2>
              <p className="mt-4 text-navy-200">Parents and school staff should be able to understand exactly how TaskTeens protects young workers. Here&apos;s what&apos;s built in today.</p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link href="/safety" className="btn bg-white text-navy-800 hover:bg-cream-100">Read the safety guide</Link>
                <Link href="/report" className="btn border border-white/30 text-white hover:bg-white/10">Report a concern</Link>
              </div>
            </div>
            <ul className="grid gap-4 sm:grid-cols-2">
              {SAFETY_POINTS.map((p) => (
                <li key={p.title} className="rounded-3xl bg-white/5 p-5 ring-1 ring-white/10">
                  <p.icon className="h-6 w-6 text-coral-300" aria-hidden="true" />
                  <h3 className="mt-3 font-semibold">{p.title}</h3>
                  <p className="mt-1 text-sm leading-6 text-navy-200">{p.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="container-page mt-24" aria-labelledby="cat-heading">
        <p className="eyebrow">Popular categories</p>
        <h2 id="cat-heading" className="mt-2 text-3xl font-bold sm:text-4xl">What teens are doing around town</h2>
        <ul className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {CATEGORIES.map((c) => (
            <li key={c.slug}>
              <Link href={`/jobs?category=${c.slug}`} className="group flex h-full flex-col rounded-3xl border border-navy-100 bg-white p-4 transition hover:-translate-y-0.5 hover:border-bay-200 hover:shadow-card">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cream-200 text-navy-700 transition group-hover:bg-bay-500 group-hover:text-white">
                  <CategoryIcon name={c.icon} className="h-5 w-5" />
                </span>
                <span className="mt-3 font-semibold text-navy-800">{c.name}</span>
                <span className="mt-0.5 text-xs leading-5 text-navy-500">{c.description}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* Service area */}
      <section className="container-page mt-24" aria-labelledby="area-heading">
        <div className="relative overflow-hidden rounded-4xl bg-bay-500 text-white">
          <SafeImage src={IMAGES.bay} alt="" className="absolute inset-0 h-full w-full opacity-25 mix-blend-luminosity" />
          <div className="relative grid gap-8 p-8 sm:p-12 lg:grid-cols-2 lg:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/80">Local service area</p>
              <h2 id="area-heading" className="mt-2 text-3xl font-bold sm:text-4xl">Starting in Berkeley, Albany &amp; El Cerrito</h2>
              <p className="mt-4 max-w-lg text-white/85">We&apos;re growing neighborhood by neighborhood so jobs stay walkable, bikeable or a short BART ride away.</p>
              <Link href="/service-area" className="btn mt-6 bg-white text-navy-800 hover:bg-cream-100">See the service area</Link>
            </div>
            <ul className="grid grid-cols-2 gap-3">
              {SERVICE_AREAS.map((a) => (
                <li key={a.slug}>
                  <Link href={`/jobs?area=${a.slug}`} className="flex items-center gap-2 rounded-2xl bg-white/15 px-4 py-3 text-sm font-semibold backdrop-blur transition hover:bg-white/25">
                    <MapPin className="h-4 w-4" aria-hidden="true" /> {a.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Employer CTA */}
      <section className="container-page mt-24" aria-labelledby="emp-heading">
        <div className="grid items-center gap-8 overflow-hidden rounded-4xl bg-white p-8 shadow-card ring-1 ring-navy-100 sm:p-12 lg:grid-cols-[1.3fr_1fr]">
          <div>
            <p className="eyebrow">For families &amp; small businesses</p>
            <h2 id="emp-heading" className="mt-2 text-3xl font-bold sm:text-4xl">Need a hand? Hire a motivated local teen.</h2>
            <p className="mt-4 max-w-xl text-navy-600">Post a clear listing in a few minutes. Applications land in your dashboard automatically — no inbox chaos, no middleman.</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/auth/sign-up?role=employer&next=/dashboard/employer/listings/new" className="btn-coral btn-lg">Post a Job</Link>
              <Link href="/hire" className="btn-outline btn-lg">How hiring works</Link>
            </div>
          </div>
          <SafeImage src={IMAGES.employer} alt="A small business owner working with a young employee" className="h-64 w-full rounded-3xl lg:h-72" />
        </div>
      </section>

      <Faq />
    </>
  );
}
