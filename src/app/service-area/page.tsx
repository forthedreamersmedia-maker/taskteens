import { MapPin } from "lucide-react";
import Link from "next/link";
import { NEIGHBORHOODS, SERVICE_AREAS } from "@/lib/constants";

export const metadata = { title: "Service Area" };

export default function ServiceAreaPage() {
  return (
    <div className="container-page py-14">
      <p className="eyebrow">Service area</p>
      <h1 className="mt-2 text-4xl font-extrabold">Where TaskTeens works</h1>
      <p className="mt-4 max-w-2xl text-lg text-navy-600">We&apos;re starting close to home — Berkeley, Albany and El Cerrito — and expanding to neighboring East Bay communities as local employers join. Remote listings from East Bay employers are welcome too.</p>
      <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SERVICE_AREAS.map((a) => (
          <li key={a.slug} className="card p-6">
            <h2 className="flex items-center gap-2 text-xl font-bold"><MapPin className="h-5 w-5 text-coral-500" aria-hidden="true" /> {a.name}</h2>
            <p className="mt-2 text-sm text-navy-500">{a.cities.flatMap((c) => NEIGHBORHOODS[c] ?? []).join(" · ") || "Work from anywhere"}</p>
            <Link href={`/jobs?area=${a.slug}`} className="link mt-4 inline-block text-sm">See jobs in {a.name}</Link>
          </li>
        ))}
      </ul>
      <p className="mt-10 text-sm text-navy-500">Listings only ever show a city or neighborhood — exact addresses are shared privately after a hire is confirmed.</p>
    </div>
  );
}
