"use client";
import { Bell, CalendarCheck, ClipboardList, Inbox, LayoutDashboard, Plus, Settings } from "lucide-react";
import Link from "next/link";
import { DashboardShell } from "@/components/layout/dashboard-shell";

const NAV = [
  { href: "/dashboard/employer", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/employer/listings", label: "Listings", icon: ClipboardList },
  { href: "/dashboard/employer/applications", label: "Applicants", icon: Inbox },
  { href: "/dashboard/employer/interviews", label: "Interviews", icon: CalendarCheck },
  { href: "/dashboard/employer/notifications", label: "Notifications", icon: Bell },
  { href: "/dashboard/employer/settings", label: "Account & verification", icon: Settings },
];

export function EmployerShell({ actions, ...props }: { title: string; subtitle?: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <DashboardShell
      nav={NAV}
      actions={actions ?? <Link href="/dashboard/employer/listings/new" className="btn-coral"><Plus className="h-4 w-4" aria-hidden="true" /> Post a job</Link>}
      {...props}
    />
  );
}
