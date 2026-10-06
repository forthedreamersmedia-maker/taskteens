import { Suspense } from "react";
import { PageLoader } from "@/components/ui/feedback";
import { ParentInvite } from "./parent-invite";

export const metadata = { title: "Parent or guardian invitation", robots: { index: false } };
export default function Page() {
  return <Suspense fallback={<PageLoader />}><ParentInvite /></Suspense>;
}
