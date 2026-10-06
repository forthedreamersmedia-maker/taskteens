"use client";
import { BadgeCheck, Clock, XCircle } from "lucide-react";
import Link from "next/link";
import { EmployerShell } from "@/components/dashboard/employer-shell";
import { AccountSettings } from "@/components/dashboard/account-settings";
import { Skeleton } from "@/components/ui/feedback";
import { useData } from "@/lib/auth-context";
import { useAsync } from "@/lib/hooks/use-async";
import { formatDate } from "@/lib/utils";

export default function EmployerSettings() {
  const data = useData();
  const { data: b, loading } = useAsync(async () => ({ profile: await data.getEmployerProfile(), req: await data.getMyVerificationRequest() }), []);
  const v = b?.profile?.verification_status;
  return (
    <EmployerShell title="Account">
      <section className="card mb-6 p-5 sm:p-6" aria-labelledby="verif">
        <h2 id="verif" className="text-lg font-bold">Verification status</h2>
        {loading ? <Skeleton className="mt-3 h-16" /> : (
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              {v === "verified" ? <BadgeCheck className="h-6 w-6 text-bay-500" aria-hidden="true" /> : v === "pending" ? <Clock className="h-6 w-6 text-amber-500" aria-hidden="true" /> : <XCircle className="h-6 w-6 text-navy-300" aria-hidden="true" />}
              <div>
                <p className="font-semibold capitalize">{v === "verified" ? "Manually reviewed" : v === "pending" ? "Review pending" : v === "rejected" ? "Not approved" : "Not reviewed yet"}</p>
                <p className="text-sm text-navy-500">
                  {v === "verified" ? `Approved ${formatDate(b?.req?.reviewed_at)}. ` : v === "pending" ? `Submitted ${formatDate(b?.req?.created_at)}. ` : ""}
                  Manual review is an administrator check of what you submitted — not a background check. Phone and address steps are on the Verification page.
                </p>
                {b?.req?.review_note && <p className="mt-1 text-sm text-navy-600">Reviewer note: {b.req.review_note}</p>}
              </div>
            </div>
            {(v === "unverified" || v === "rejected") && <Link href="/onboarding/employer?next=/dashboard/employer/settings" className="btn-primary btn-sm">Request review</Link>}
          </div>
        )}
        <div className="mt-4 border-t border-navy-50 pt-4">
          <Link href="/onboarding/employer?next=/dashboard/employer/settings" className="link text-sm">Edit public employer profile</Link>{" · "}<Link href="/dashboard/employer/verification" className="link text-sm">All verification steps</Link>
        </div>
      </section>
      <AccountSettings privacyNotes={["Your phone number and email are never shown on listings.", "Listings show only city and approximate neighborhood.", "Teens' contact details are not shared — use TaskTeens messages, which parents can read."]} />
    </EmployerShell>
  );
}
