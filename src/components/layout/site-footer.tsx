import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { CONTACT_EMAIL } from "@/lib/constants";

const COLS = [
  { title: "Teens", links: [["Find jobs", "/jobs"], ["How it works", "/how-it-works"], ["Create a teen account", "/auth/sign-up?role=teen"], ["Safety tips", "/safety"]] },
  { title: "Employers", links: [["Hire teens", "/hire"], ["Post a job", "/auth/sign-up?role=employer&next=/dashboard/employer/listings/new"], ["Employer conduct rules", "/guidelines#employers"], ["Verification", "/hire#verification"]] },
  { title: "Trust & legal", links: [["Safety center", "/safety"], ["Report a concern", "/report"], ["Community guidelines", "/guidelines"], ["Payment policy", "/payment-policy"], ["Privacy policy", "/privacy"], ["Terms of use", "/terms"]] },
  { title: "Service area", links: [["Berkeley", "/jobs?city=Berkeley"], ["Albany", "/jobs?city=Albany"], ["El Cerrito", "/jobs?city=El%20Cerrito"], ["All service areas", "/service-area"]] },
];

export function SiteFooter() {
  return (
    <footer className="relative isolate mt-24 overflow-hidden bg-navy-900 text-navy-100">
      <picture>
        <source media="(max-width: 768px)" srcSet="/footer-bridge-sm.jpg" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/footer-bridge.jpg" alt="" aria-hidden="true" loading="lazy" className="absolute inset-0 -z-20 h-full w-full object-cover object-[center_58%]" />
      </picture>
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-b from-navy-900/80 via-navy-900/45 to-navy-900/75" />
      <div className="container-page grid gap-10 py-14 md:grid-cols-[1.3fr_repeat(4,1fr)]">
        <div>
          <Logo light />
          <p className="mt-4 font-brand text-xs font-bold italic tracking-[0.12em] text-coral-300">Making Job Hunting Easier For Teens</p>
          <p className="mt-3 max-w-xs text-sm leading-6 text-navy-200">Local jobs, internships, volunteering and real work experience for teens in Berkeley, Albany, El Cerrito and the surrounding East Bay.</p>
          <div className="mt-5 space-y-1 text-sm">
            <p>
              Email: <a className="text-white underline-offset-4 hover:underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
            </p>
          </div>
        </div>
        {COLS.map((c) => (
          <nav key={c.title} aria-label={c.title}>
            <h2 className="text-sm font-semibold text-white">{c.title}</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {c.links.map(([label, href]) => (
                <li key={href}>
                  <Link href={href} className="text-white/80 transition hover:text-white">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-white/15 bg-navy-900/40 backdrop-blur-sm">
        <div className="container-page flex flex-col gap-2 py-6 text-xs text-navy-300 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} TaskTeens. Bay Area Built.</p>
          <p>
            In an emergency, call <strong className="text-white">911</strong>. For safety concerns, use{" "}
            <Link href="/report" className="text-white underline underline-offset-2">Report a concern</Link>.
          </p>
        </div>
      </div>
    </footer>
  );
}
