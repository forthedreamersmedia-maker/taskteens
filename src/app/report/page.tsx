"use client";
import { AlertOctagon, Phone } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ReportForm } from "@/components/safety/report-dialog";

function ReportInner() {
  const sp = useSearchParams();
  const severity = (sp.get("severity") as "normal" | "urgent" | "emergency") ?? "normal";
  const target = (sp.get("type") as "job" | "user" | "application" | "other") ?? "other";
  return (
    <div className="container-page max-w-2xl py-12">
      <div className="rounded-3xl bg-coral-600 p-6 text-white">
        <p className="flex items-center gap-2 text-lg font-bold"><AlertOctagon className="h-6 w-6" aria-hidden="true" /> In immediate danger?</p>
        <p className="mt-1 text-white/90">Call <a href="tel:911" className="font-bold underline">911</a> now. Then tell a trusted adult. You can file a report below afterwards.</p>
        <a href="tel:911" className="btn mt-4 bg-white text-coral-700 hover:bg-coral-50"><Phone className="h-4 w-4" aria-hidden="true" /> Call 911</a>
      </div>
      <h1 className="mt-10 text-3xl font-bold">Report a concern</h1>
      <p className="mt-2 text-navy-500">Anyone can report — you don&apos;t need an account. Reports go directly to TaskTeens moderators and are never shared with the person you&apos;re reporting.</p>
      <Link href="/report/payment" className="mt-6 flex items-center justify-between gap-3 rounded-2xl border border-navy-100 bg-white p-4 text-sm hover:border-coral-300">
        <span><strong>Didn&apos;t get paid for a job?</strong> Use the payment report form instead — it asks for the details we need.</span>
        <span className="font-semibold text-coral-600">Payment report →</span>
      </Link>
      <div className="card mt-6 p-6">
        <ReportForm targetType={target} targetId={sp.get("id")} defaultSeverity={severity} />
      </div>
    </div>
  );
}

export default function ReportPage() {
  return <Suspense><ReportInner /></Suspense>;
}
