"use client";
import { Alert } from "@/components/ui/feedback";
import { useAuth } from "@/lib/auth-context";
import { isDemoMode } from "@/lib/config";
import { useSafetyQuery } from "@/lib/safety/client";

/** Neutral notice shown to a restricted user. Never says who reported them or why. */
export function RestrictionNotice() {
  const { session } = useAuth();
  const q = useSafetyQuery(async (sb) => {
    if (!session || isDemoMode) return null;
    const { data } = await sb.rpc("my_restriction");
    return (Array.isArray(data) ? data[0] : data) as { restricted: boolean } | null;
  }, [session?.user.id]);
  if (!q.data?.restricted) return null;
  return (
    <Alert tone="warn" className="mb-5" title="Your account is temporarily restricted">
      While our team reviews a report, you can&apos;t publish listings, apply, message, or change applications. We&apos;ll contact you by email.
    </Alert>
  );
}
