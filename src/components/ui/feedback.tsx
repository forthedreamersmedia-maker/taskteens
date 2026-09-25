"use client";
import { AlertTriangle, Inbox, Loader2, RefreshCw } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export function Spinner({ className, label = "Loading" }: { className?: string; label?: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2">
      <Loader2 className={cn("h-4 w-4 animate-spin", className)} aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function PageLoader({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-navy-400" role="status" aria-live="polite">
      <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" /> {label}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} aria-hidden="true" />;
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  body,
  action,
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  body?: React.ReactNode;
  action?: { label: string; href?: string; onClick?: () => void };
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center rounded-3xl border border-dashed border-navy-200 bg-white/60 px-6 py-12 text-center", className)}>
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-cream-200 text-navy-600">
        <Icon className="h-6 w-6" aria-hidden="true" />
      </div>
      <h3 className="text-base font-semibold text-navy-800">{title}</h3>
      {body && <p className="mt-1 max-w-md text-sm text-navy-500">{body}</p>}
      {action &&
        (action.href ? (
          <Link href={action.href} className="btn-primary mt-5">
            {action.label}
          </Link>
        ) : (
          <button type="button" onClick={action.onClick} className="btn-primary mt-5">
            {action.label}
          </button>
        ))}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center rounded-3xl border border-coral-200 bg-coral-50 px-6 py-10 text-center">
      <AlertTriangle className="mb-3 h-6 w-6 text-coral-600" aria-hidden="true" />
      <p className="text-sm font-medium text-coral-800">{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="btn-outline btn-sm mt-4">
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Try again
        </button>
      )}
    </div>
  );
}

export function Alert({ tone = "info", title, children, className }: { tone?: "info" | "warn" | "error" | "success"; title?: string; children?: React.ReactNode; className?: string }) {
  const styles = {
    info: "border-bay-200 bg-bay-50 text-bay-900",
    warn: "border-amber-200 bg-amber-50 text-amber-900",
    error: "border-coral-200 bg-coral-50 text-coral-900",
    success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  }[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cn("rounded-2xl border px-4 py-3 text-sm", styles, className)}>
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={cn(title && "mt-0.5", "opacity-90")}>{children}</div>}
    </div>
  );
}
