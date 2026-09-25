import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { CONTACT_EMAIL } from "@/lib/constants";

const COLS = [
  { title: "Teens", links: [["Find jobs", "/jobs"], ["How it works", "/how-it-works"], ["Create a teen account", "/auth/sign-up?role=teen"], ["Safety tips", "/safety"]] },
  { title: "Employers", links: [["Hire teens", "/hire"], ["Post a job", "/auth/sign-up?role=employer&next=/dashboard/employer/listings/new"], ["Employer conduct rules", "/guidelines#employers"], ["Verification", "/hire#verification"]] },
  { title: "Trust & legal", links: [["Safety center", "/safety"], ["Report a concern", "/report"], ["Community guidelines", "/guidelines"], ["Privacy policy", "/privacy"], ["Terms of use", "/terms"]] },
  { title: "Service area", links: [["Berkeley", "/jobs?city=Berkeley"], ["Albany", "/jobs?city=Albany"], ["El Cerrito", "/jobs?city=El%20Cerrito"], ["All service areas", "/service-area"]] },
];

export function SiteFooter() {
  return (
    <footer className="mt-24 bg-navy-800 text-navy-100">
      <div className="container-page grid gap-10 py-14 md:grid-cols-[1.3fr_repeat(4,1fr)]">
        <div>
          <Logo light />
          <p className="mt-4 font-brand text-xs font-bold italic tracking-[0.12em] text-coral-300">Making Job Hunting Easier For Teens</p>
          <p className="mt-3 max-w-xs text-sm leading-6 text-navy-200">Local jobs and real work experience for teens in Berkeley, Albany, El Cerrito and the surrounding East Bay.</p>
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
                  <Link href={href} className="text-navy-200 transition hover:text-white">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-white/10">
        <div className="container-page flex flex-col gap-2 py-6 text-xs text-navy-300 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} TaskTeens. Early-stage MVP — legal pages are starter drafts pending professional review.</p>
          <p>
            In an emergency, call <strong className="text-white">911</strong>. For safety concerns, use{" "}
            <Link href="/report" className="text-white underline underline-offset-2">Report a concern</Link>.
          </p>
        </div>
      </div>
    </footer>
  );
}
