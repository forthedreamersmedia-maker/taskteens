"use client";
import { Bell, Bookmark, CalendarCheck, FileText, LayoutDashboard, Settings, UserRound } from "lucide-react";
import { DashboardShell } from "@/components/layout/dashboard-shell";

const NAV = [
  { href: "/dashboard/teen", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/teen/applications", label: "Applications", icon: FileText },
  { href: "/dashboard/teen/saved", label: "Saved jobs", icon: Bookmark },
  { href: "/dashboard/teen/interviews", label: "Interviews", icon: CalendarCheck },
  { href: "/dashboard/teen/notifications", label: "Notifications", icon: Bell },
  { href: "/dashboard/teen/profile", label: "Profile & résumé", icon: UserRound },
  { href: "/dashboard/teen/settings", label: "Privacy & settings", icon: Settings },
];

export function TeenShell(props: { title: string; subtitle?: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return <DashboardShell nav={NAV} {...props} />;
}
