"use client";
import { ShieldAlert } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { PageLoader } from "@/components/ui/feedback";
import { dashboardPathFor, useAuth } from "@/lib/auth-context";
import type { Role } from "@/lib/types";

/**
 * Client-side guard for dashboards. In Supabase mode the middleware already
 * enforces this on the server (role read from the database) and RLS protects
 * the data itself; this component just provides the UX.
 */
export function RequireRole({ roles, children }: { roles: Role[]; children: React.ReactNode }) {
  const { session, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !session) router.replace(`/auth/sign-in?next=${encodeURIComponent(pathname)}`);
  }, [loading, session, router, pathname]);

  if (loading || !session) return <PageLoader label="Checking your session…" />;
  if (!roles.includes(session.user.role)) {
    return (
      <div className="container-page py-20">
        <div className="card mx-auto max-w-md p-8 text-center">
          <ShieldAlert className="mx-auto h-8 w-8 text-coral-500" aria-hidden="true" />
          <h1 className="mt-3 text-xl font-bold">This area isn&apos;t for your account type</h1>
          <p className="mt-2 text-sm text-navy-500">You&apos;re signed in as a {session.user.role}. Head to your own dashboard instead.</p>
          <Link href={dashboardPathFor(session.user.role)} className="btn-primary mt-6">Go to my dashboard</Link>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
