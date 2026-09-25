import { Suspense } from "react";
import { PageLoader } from "@/components/ui/feedback";
import { SignInForm } from "./sign-in-form";

export const metadata = { title: "Sign In" };
export default function Page() {
  return <Suspense fallback={<PageLoader />}><SignInForm /></Suspense>;
}
