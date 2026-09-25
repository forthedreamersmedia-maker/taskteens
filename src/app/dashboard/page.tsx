"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { PageLoader } from "@/components/ui/feedback";
import { dashboardPathFor, useAuth } from "@/lib/auth-context";

/** Sends each user to the dashboard for their role. */
export default function DashboardRouter() {
  const { session, loading } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (loading) return;
    router.replace(session ? dashboardPathFor(session.user.role) : "/auth/sign-in?next=/dashboard");
  }, [session, loading, router]);
  return <PageLoader label="Opening your dashboard…" />;
}
