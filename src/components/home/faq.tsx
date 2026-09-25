import { ChevronDown } from "lucide-react";

export const FAQS = [
  {
    q: "Who can use TaskTeens?",
    a: "Teens ages 14–19 who live in or near Berkeley, Albany, El Cerrito and the surrounding East Bay can create a worker account. Families, individuals and small businesses in the area can create an employer account. Minimum ages are set per listing and by platform rules that administrators can configure.",
  },
  {
    q: "Does it cost anything?",
    a: "Teens never pay to create an account or apply. This early version of TaskTeens has no payments or fees built in; any future employer pricing would be announced before it takes effect.",
  },
  {
    q: "Are employers background-checked?",
    a: "No. TaskTeens does not currently run background checks. Employers can request a profile review, where an administrator checks the information they submitted. A “Verified profile” badge appears only after that review is approved — it is not a background check or a legal guarantee. Always follow our safety guidelines.",
  },
  {
    q: "Do I need a work permit?",
    a: "It depends on your age, the kind of work and who is hiring. TaskTeens doesn't decide that for you. Ask your school's work-permit office or check the California Department of Industrial Relations. The application form asks for your status so employers know where things stand.",
  },
  {
    q: "What personal information do employers see?",
    a: "Only what you put in an application for their job: your name, age range, city, the contact email and phone you choose, and your answers. Your home address, school schedule and profile are never shown publicly.",
  },
  {
    q: "How do employers get my application?",
    a: "Automatically. When you press Submit, your application goes straight to that employer's dashboard and they get an email. You'll get a confirmation and a notification every time they update your status.",
  },
  {
    q: "What if something feels wrong?",
    a: "Stop, leave if you are somewhere unsafe, and tell a trusted adult. Use the Report button on any listing or the Report a Concern page. In an emergency, call 911.",
  },
];

export function Faq() {
  return (
    <section className="container-page mt-24" aria-labelledby="faq-heading">
      <div className="grid gap-10 lg:grid-cols-[1fr_1.6fr]">
        <div>
          <p className="eyebrow">FAQ</p>
          <h2 id="faq-heading" className="mt-2 text-3xl font-bold sm:text-4xl">Questions from teens, parents and employers</h2>
          <p className="mt-3 text-navy-500">Can&apos;t find what you need? Email us — a real person reads every message.</p>
        </div>
        <div className="divide-y divide-navy-100 rounded-3xl border border-navy-100 bg-white">
          {FAQS.map((f) => (
            <details key={f.q} className="group px-5 py-4 sm:px-6 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-lg py-1 font-semibold text-navy-800">
                {f.q}
                <ChevronDown className="h-5 w-5 shrink-0 text-navy-400 transition group-open:rotate-180" aria-hidden="true" />
              </summary>
              <p className="mt-2 text-sm leading-6 text-navy-600">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
