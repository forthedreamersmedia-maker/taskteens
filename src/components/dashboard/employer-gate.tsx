"use client";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { PageLoader } from "@/components/ui/feedback";
import { useData } from "@/lib/auth-context";
import { useAsync } from "@/lib/hooks/use-async";

/** Sends employers who haven't finished onboarding to the onboarding flow. */
export function EmployerGate({ children }: { children: React.ReactNode }) {
  const data = useData();
  const router = useRouter();
  const pathname = usePathname();
  const { data: profile, loading } = useAsync(() => data.getEmployerProfile(), []);
  const needsOnboarding = !loading && !profile?.onboarded;
  useEffect(() => {
    if (needsOnboarding) router.replace(`/onboarding/employer?next=${encodeURIComponent(pathname)}`);
  }, [needsOnboarding, router, pathname]);
  if (loading || needsOnboarding) return <PageLoader label="Loading your employer dashboard…" />;
  return <>{children}</>;
}
