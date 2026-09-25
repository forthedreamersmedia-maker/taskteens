import { BellRing, ClipboardCheck, FileText, Handshake, Search, ShieldCheck, UserPlus, Users } from "lucide-react";

export const TEEN_STEPS = [
  { icon: UserPlus, title: "Create your profile", body: "Add your skills, availability and how you get around. No home address, no Social Security number — ever." },
  { icon: Search, title: "Find local work", body: "Filter by city, schedule, pay and age. Every listing shows only the city or neighborhood, never an exact address." },
  { icon: FileText, title: "Apply in minutes", body: "One form, sent straight to the employer's dashboard. You get a confirmation email right away." },
  { icon: BellRing, title: "Track every update", body: "Get notified when your application is viewed, when an interview is requested, and when a decision is made." },
];

export const EMPLOYER_STEPS = [
  { icon: Users, title: "Set up your profile", body: "Individual or business. Tell teens who you are and request a profile review for the Verified badge." },
  { icon: ClipboardCheck, title: "Post a clear listing", body: "Pay, schedule, age, transportation and responsibilities — up front. Listings are reviewed before going live." },
  { icon: Handshake, title: "Review applicants", body: "Applications arrive in your dashboard automatically. Filter by status, add private notes, request interviews." },
  { icon: ShieldCheck, title: "Hire safely", body: "Meet in public or over video, welcome a parent or guardian, and follow our conduct rules." },
];

export function StepList({ steps, accent = "bay" }: { steps: typeof TEEN_STEPS; accent?: "bay" | "coral" }) {
  return (
    <ol className="grid gap-4 sm:grid-cols-2">
      {steps.map((s, i) => (
        <li key={s.title} className="card relative p-5">
          <div className="flex items-center gap-3">
            <span className={accent === "bay" ? "flex h-10 w-10 items-center justify-center rounded-2xl bg-bay-50 text-bay-600" : "flex h-10 w-10 items-center justify-center rounded-2xl bg-coral-50 text-coral-600"}>
              <s.icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="text-xs font-semibold uppercase tracking-wider text-navy-400">Step {i + 1}</span>
          </div>
          <h4 className="mt-3 font-semibold text-navy-800">{s.title}</h4>
          <p className="mt-1 text-sm leading-6 text-navy-500">{s.body}</p>
        </li>
      ))}
    </ol>
  );
}
