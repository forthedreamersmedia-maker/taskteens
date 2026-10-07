"use client";
import { Camera } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/lib/auth-context";
import { uploadEvidence } from "@/lib/safety/incidents";
import { must, safetySupabase, useSafetyQuery } from "@/lib/safety/client";

/** Before/after photos for a confirmed job: a shared record for the teen, employer and parent if there's ever a dispute. */
export function BeforeAfterPhotos({ applicationId }: { applicationId: string }) {
  const { session } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const q = useSafetyQuery(async (sb) => must(await sb.from("incident_evidence").select("id,phase").eq("application_id", applicationId).in("phase", ["before", "after"])) as { id: string; phase: string }[], [applicationId]);
  const count = (p: string) => q.data?.filter((e) => e.phase === p).length ?? 0;
  const add = async (phase: "before" | "after", files: File[]) => {
    const sb = safetySupabase();
    if (!sb || !session) return;
    const failed: string[] = [];
    for (const [i, f] of files.entries()) {
      setBusy(`Uploading ${i + 1} of ${files.length}…`);
      try { await uploadEvidence(sb, session.user.id, f, { phase, applicationId }); } catch (x) { failed.push(x instanceof Error ? x.message : f.name); }
    }
    setBusy(null);
    if (failed.length) toast({ tone: "error", title: "Some photos didn't upload", body: failed.join("\n") });
    else toast({ tone: "success", title: "Photos saved" });
    q.reload();
  };
  return (
    <div className="rounded-2xl bg-cream-50 p-3 text-sm">
      <p className="flex items-center gap-1.5 font-semibold"><Camera className="h-4 w-4" aria-hidden="true" /> Before &amp; after photos (optional)</p>
      <p className="mt-1 text-xs text-navy-500">Photos of the work area help if there&apos;s ever a disagreement. The employer and your parent can see them. They can&apos;t be deleted once uploaded.</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {(["before", "after"] as const).map((p) => (
          <label key={p} className="btn-outline btn-sm cursor-pointer">
            {busy && <span className="sr-only">{busy}</span>}
            {p === "before" ? "Add before photos" : "Add after photos"}{count(p) ? ` (${count(p)})` : ""}
            <input type="file" accept="image/*" capture="environment" multiple className="sr-only" disabled={!!busy}
              onChange={(e) => { const f = Array.from(e.target.files ?? []); e.target.value = ""; if (f.length) void add(p, f); }} />
          </label>
        ))}
      </div>
      {busy && <p className="mt-1 text-xs text-navy-500">{busy}</p>}
    </div>
  );
}
