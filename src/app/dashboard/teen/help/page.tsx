"use client";
import { Phone } from "lucide-react";
import { TeenShell } from "@/components/dashboard/teen-shell";
import { RequiresBackend } from "@/components/safety/demo-notice";
import { SosPanel } from "@/components/safety/sos";
import { isDemoMode } from "@/lib/config";
import { useSafetyQuery } from "@/lib/safety/client";

/** Always-available safety page for teens, whether or not a job is happening. */
export default function TeenHelp() {
  const q = useSafetyQuery(async (sb) => ((await sb.from("parent_profiles").select("display_name,phone_e164")).data ?? []) as { display_name: string; phone_e164: string | null }[], []);
  if (isDemoMode) return <TeenShell title="Get help"><RequiresBackend feature="Safety alerts" /></TeenShell>;
  const parent = q.data?.find((p) => p.phone_e164) ?? null;
  return (
    <TeenShell title="Get help" subtitle="If you're in danger, call 911. These buttons also alert your parent and TaskTeens.">
      <section className="card space-y-4 p-5">
        <SosPanel parentPhone={parent?.phone_e164 ?? null} />
        {parent?.phone_e164 && <a href={`tel:${parent.phone_e164}`} className="btn-outline w-full sm:w-auto"><Phone className="h-4 w-4" aria-hidden="true" /> Call {parent.display_name || "my parent"}</a>}
      </section>
      <section className="card mt-4 space-y-2 p-5 text-sm text-navy-600">
        <h2 className="text-base font-bold text-navy-800">If something feels wrong</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>You can leave any job at any time. You don&apos;t need permission and you won&apos;t get in trouble.</li>
          <li>Go somewhere public — a store, a neighbor&apos;s, a busy street — and call your parent.</li>
          <li>The employer is never told you sent an alert, and they can&apos;t see your location.</li>
          <li>After you&apos;re safe, you can file a report from your application so TaskTeens can review what happened.</li>
        </ul>
      </section>
    </TeenShell>
  );
}
