"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export interface NavItem { href: string; label: string; icon: LucideIcon; exact?: boolean; badge?: number }

export function DashboardShell({ title, subtitle, nav, children, actions }: { title: string; subtitle?: string; nav: NavItem[]; children: React.ReactNode; actions?: React.ReactNode }) {
  const pathname = usePathname();
  const isActive = (n: NavItem) => (n.exact ? pathname === n.href : pathname === n.href || pathname.startsWith(n.href + "/"));
  return (
    <div className="container-page py-6 lg:py-10">
      <div className="lg:grid lg:grid-cols-[230px_1fr] lg:gap-8">
        <aside className="mb-5 lg:mb-0">
          <nav aria-label="Dashboard" className="-mx-4 overflow-x-auto px-4 lg:sticky lg:top-24 lg:mx-0 lg:overflow-visible lg:px-0">
            <ul className="flex gap-1.5 lg:flex-col">
              {nav.map((n) => (
                <li key={n.href} className="shrink-0">
                  <Link
                    href={n.href}
                    aria-current={isActive(n) ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-2.5 whitespace-nowrap rounded-full px-3.5 py-2 text-sm font-medium transition lg:rounded-xl",
                      isActive(n) ? "bg-navy-800 text-white shadow-sm" : "bg-white text-navy-600 hover:bg-navy-50 lg:bg-transparent",
                    )}
                  >
                    <n.icon className="h-4 w-4" aria-hidden="true" />
                    {n.label}
                    {!!n.badge && <span className={cn("ml-auto rounded-full px-1.5 text-[11px] font-bold", isActive(n) ? "bg-white/20" : "bg-coral-100 text-coral-700")}>{n.badge}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </aside>
        <div className="min-w-0">
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>
              {subtitle && <p className="mt-1 text-sm text-navy-500">{subtitle}</p>}
            </div>
            {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

export function StatCard({ label, value, hint, icon: Icon, tone = "navy" }: { label: string; value: number | string; hint?: string; icon?: LucideIcon; tone?: "navy" | "coral" | "blue" | "green" }) {
  const tones = { navy: "bg-navy-50 text-navy-700", coral: "bg-coral-50 text-coral-600", blue: "bg-bay-50 text-bay-600", green: "bg-emerald-50 text-emerald-600" };
  return (
    <div className="card p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-navy-400">{label}</p>
        {Icon && (
          <span className={cn("rounded-xl p-2", tones[tone])}>
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
        )}
      </div>
      <p className="mt-2 font-display text-3xl font-bold">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-navy-400">{hint}</p>}
    </div>
  );
}

export function Section({ title, action, children, className }: { title: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("mt-8", className)} aria-label={title}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
