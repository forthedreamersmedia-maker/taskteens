import { Wallet } from "lucide-react";
import Link from "next/link";
import { LegalPage } from "@/components/layout/legal-page";
import { LegalDoc, LegalToc } from "@/components/layout/legal-doc";
import { PAYMENT_EFFECTIVE, PAYMENT_POLICY, PAYMENT_UPDATED } from "@/content/payment";

export const metadata = { title: "Payment and Nonpayment Policy" };

export default function PaymentPolicyPage() {
  return (
    <LegalPage
      title="Payment and Nonpayment Policy"
      effective={PAYMENT_EFFECTIVE}
      updated={PAYMENT_UPDATED}
      toc={
        <>
          <Link href="/report/payment" className="mt-6 flex items-center gap-3 rounded-2xl bg-coral-500 p-4 text-white shadow-card transition hover:bg-coral-600">
            <Wallet className="h-6 w-6 shrink-0" aria-hidden="true" />
            <span>
              <span className="block font-semibold">Haven&apos;t been paid for a job?</span>
              <span className="text-sm text-white/90">Submit a payment report — it goes straight to TaskTeens moderators.</span>
            </span>
          </Link>
          <LegalToc source={PAYMENT_POLICY} />
        </>
      }
    >
      <LegalDoc source={PAYMENT_POLICY} />
    </LegalPage>
  );
}
