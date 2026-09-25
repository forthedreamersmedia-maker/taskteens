"use client";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/utils";

export function useSavedJobs() {
  const { data, session } = useAuth();
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [ready, setReady] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();

  useEffect(() => {
    if (!session) {
      setSaved(new Set());
      setReady(true);
      return;
    }
    data.listSavedJobIds().then((ids) => {
      setSaved(new Set(ids));
      setReady(true);
    });
  }, [data, session]);

  const toggle = useCallback(
    async (jobId: string) => {
      if (!session) {
        router.push(`/auth/sign-in?next=${encodeURIComponent(pathname)}`);
        return;
      }
      if (session.user.role !== "teen") {
        toast({ tone: "info", title: "Saving jobs is for teen accounts", body: "Employers and admins can view listings but not save them." });
        return;
      }
      // optimistic
      setSaved((s) => {
        const n = new Set(s);
        if (n.has(jobId)) n.delete(jobId);
        else n.add(jobId);
        return n;
      });
      try {
        const now = await data.toggleSavedJob(jobId);
        toast({ tone: "success", title: now ? "Job saved" : "Removed from saved jobs" });
      } catch (e) {
        toast({ tone: "error", title: "Couldn't update saved jobs", body: errorMessage(e) });
        data.listSavedJobIds().then((ids) => setSaved(new Set(ids)));
      }
    },
    [data, session, router, pathname, toast],
  );

  return { saved, toggle, ready };
}
