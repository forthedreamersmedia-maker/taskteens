import { Suspense } from "react";
import { PageLoader } from "@/components/ui/feedback";
import { SignUpForm } from "./sign-up-form";

export const metadata = { title: "Create Account" };
export default function Page() {
  return <Suspense fallback={<PageLoader />}><SignUpForm /></Suspense>;
}
