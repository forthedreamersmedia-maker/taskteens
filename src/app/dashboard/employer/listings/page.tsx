"use client";
import { ClipboardList, Eye, MoreHorizontal, Pause, Pencil, Play, Send, Trash2, Users, XCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { EmployerShell } from "@/components/dashboard/employer-shell";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { SafeImage } from "@/components/ui/image";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { useData } from "@/lib/auth-context";
import { useAsync } from "@/lib/hooks/use-async";
import type { Job, JobStatus } from "@/lib/types";
import { categoryName, cn, errorMessage, formatDate, formatPay } from "@/lib/utils";

const TABS: { key: string; label: string; match: (j: Job) => boolean }[] = [
  { key: "active", label: "Active", match: (j) => j.status === "published" },
  { key: "draft", label: "Drafts", match: (j) => j.status === "draft" },
  { key: "paused", label: "Paused", match: (j) => j.status === "paused" },
  { key: "closed", label: "Closed", match: (j) => j.status === "closed" },
  { key: "all", label: "All", match: () => true },
];

function ModerationBadge({ j }: { j: Job }) {
  if (j.status === "draft") return <Badge tone="gray">Draft</Badge>;
  if (j.moderation_status === "pending") return <Badge tone="amber">Awaiting review</Badge>;
  if (j.moderation_status === "rejected") return <Badge tone="coral">Not approved</Badge>;
  const map: Record<JobStatus, [string, "green" | "gray" | "navy" | "coral"]> = { published: ["Live", "green"], paused: ["Paused", "navy"], closed: ["Closed", "gray"], draft: ["Draft", "gray"], removed: ["Removed", "coral"] };
  return <Badge tone={map[j.status][1]}>{map[j.status][0]}</Badge>;
}

function RowMenu({ job, counts, onAction }: { job: Job; counts: number; onAction: (a: "publish" | "pause" | "close" | "delete") => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const item = "flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm hover:bg-cream-100";
  return (
    <div className="relative" ref={ref}>
      <button type="button" className="rounded-full p-2 text-navy-500 hover:bg-navy-50" aria-label={`Actions for ${job.title}`} aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen((o) => !o)}>
        <MoreHorizontal className="h-5 w-5" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-20 mt-1 w-48 rounded-2xl border border-navy-100 bg-white p-1.5 shadow-lift" onKeyDown={(e) => e.key === "Escape" && setOpen(false)}>
          <Link role="menuitem" href={`/jobs/${job.id}`} className={item}><Eye className="h-4 w-4" aria-hidden="true" /> Preview</Link>
          <Link role="menuitem" href={`/dashboard/employer/listings/${job.id}/edit`} className={item}><Pencil className="h-4 w-4" aria-hidden="true" /> Edit</Link>
          <Link role="menuitem" href={`/dashboard/employer/applications?job=${job.id}`} className={item}><Users className="h-4 w-4" aria-hidden="true" /> Applicants ({counts})</Link>
          {job.status !== "published" && <button role="menuitem" type="button" className={item} onClick={() => { setOpen(false); onAction("publish"); }}>{job.status === "draft" ? <Send className="h-4 w-4" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />} {job.status === "draft" ? "Publish" : "Re-open"}</button>}
          {job.status === "published" && <button role="menuitem" type="button" className={item} onClick={() => { setOpen(false); onAction("pause"); }}><Pause className="h-4 w-4" aria-hidden="true" /> Pause</button>}
          {job.status !== "closed" && <button role="menuitem" type="button" className={item} onClick={() => { setOpen(false); onAction("close"); }}><XCircle className="h-4 w-4" aria-hidden="true" /> Close</button>}
          <button role="menuitem" type="button" className={cn(item, "text-coral-700")} onClick={() => { setOpen(false); onAction("delete"); }}><Trash2 className="h-4 w-4" aria-hidden="true" /> Delete</button>
        </div>
      )}
    </div>
  );
}

export default function ListingsPage() {
  const data = useData();
  const toast = useToast();
  const { data: b, loading, error, reload } = useAsync(async () => {
    const [jobs, apps] = await Promise.all([data.listMyJobs(), data.listEmployerApplications()]);
    const counts: Record<string, number> = {};
    apps.forEach((a) => (counts[a.job_id] = (counts[a.job_id] ?? 0) + 1));
    return { jobs, counts };
  }, []);
  const [tab, setTab] = useState("active");
  const [confirmDelete, setConfirmDelete] = useState<Job | null>(null);

  const act = async (job: Job, a: "publish" | "pause" | "close" | "delete") => {
    if (a === "delete") return setConfirmDelete(job);
    try {
      await data.setJobStatus(job.id, a === "publish" ? "published" : a === "pause" ? "paused" : "closed");
      toast({ tone: "success", title: a === "publish" ? (job.moderation_status === "approved" ? "Listing is live" : "Submitted for review") : a === "pause" ? "Listing paused" : "Listing closed" });
      reload(true);
    } catch (e) {
      toast({ tone: "error", title: "Action failed", body: errorMessage(e) });
    }
  };

  const list = b?.jobs.filter(TABS.find((t) => t.key === tab)!.match) ?? [];

  return (
    <EmployerShell title="Listings" subtitle="Create, publish, pause, close or delete your job posts.">
      <div role="tablist" aria-label="Listing status" className="-mx-1 mb-5 flex gap-1 overflow-x-auto px-1">
        {TABS.map((t) => {
          const n = b?.jobs.filter(t.match).length ?? 0;
          return (
            <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)} className={cn("shrink-0 rounded-full px-4 py-1.5 text-sm font-medium", tab === t.key ? "bg-navy-800 text-white" : "bg-white text-navy-600 ring-1 ring-navy-100 hover:bg-navy-50")}>
              {t.label} <span className="opacity-60">{n}</span>
            </button>
          );
        })}
      </div>
      {loading ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !list.length ? (
        <EmptyState icon={ClipboardList} title={tab === "active" ? "No active listings" : "Nothing here"} body="Post a job to start receiving applications from local teens." action={{ label: "Post a job", href: "/dashboard/employer/listings/new" }} />
      ) : (
        <ul className="space-y-3">
          {list.map((j) => (
            <li key={j.id} className="card flex items-center gap-4 p-4">
              <SafeImage src={j.image_url} alt="" fallbackLabel={categoryName(j.category)} className="hidden h-16 w-24 shrink-0 rounded-xl sm:block" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/dashboard/employer/listings/${j.id}/edit`} className="truncate font-semibold hover:underline">{j.title}</Link>
                  <ModerationBadge j={j} />
                </div>
                <p className="mt-0.5 truncate text-sm text-navy-500">{j.city} · {formatPay(j)} · {j.deadline ? `deadline ${formatDate(j.deadline)}` : "no deadline"}</p>
                <Link href={`/dashboard/employer/applications?job=${j.id}`} className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-bay-600 hover:underline">
                  <Users className="h-3.5 w-3.5" aria-hidden="true" /> {b?.counts[j.id] ?? 0} applicant{(b?.counts[j.id] ?? 0) === 1 ? "" : "s"}
                </Link>
              </div>
              <RowMenu job={j} counts={b?.counts[j.id] ?? 0} onAction={(a) => act(j, a)} />
            </li>
          ))}
        </ul>
      )}
      <Modal open={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="Delete this listing?" description={confirmDelete?.title} size="sm">
        <p className="text-sm text-navy-600">Listings with applications are closed instead of deleted, so applicant records are kept.</p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn-outline" onClick={() => setConfirmDelete(null)}>Cancel</button>
          <button
            type="button"
            className="btn-coral"
            onClick={async () => {
              const j = confirmDelete!;
              setConfirmDelete(null);
              try {
                await data.deleteJob(j.id);
                toast({ tone: "success", title: "Listing deleted" });
              } catch (e) {
                toast({ tone: "info", title: "Listing closed", body: errorMessage(e) });
              }
              reload(true);
            }}
          >
            Delete
          </button>
        </div>
      </Modal>
    </EmployerShell>
  );
}
