import { Suspense } from "react";
import { PageLoader } from "@/components/ui/feedback";
import { MfaForm } from "./mfa-form";

export const metadata = { title: "Two-step verification", robots: { index: false } };
export default function Page() {
  return <Suspense fallback={<PageLoader />}><MfaForm /></Suspense>;
}
