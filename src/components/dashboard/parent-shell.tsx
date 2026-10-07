"use client";
import { Bell, FileText, FileWarning, LayoutDashboard, Settings, MessageSquare, ShieldCheck } from "lucide-react";
import { DashboardShell } from "@/components/layout/dashboard-shell";

const NAV = [
  { href: "/dashboard/parent", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/parent/applications", label: "Applications", icon: FileText },
  { href: "/dashboard/parent/messages", label: "Messages", icon: MessageSquare },
  { href: "/dashboard/parent/active", label: "Active jobs", icon: ShieldCheck },
  { href: "/incidents", label: "Reports", icon: FileWarning },
  { href: "/dashboard/parent/notifications", label: "Notifications", icon: Bell },
  { href: "/dashboard/parent/settings", label: "Settings", icon: Settings },
];

export function ParentShell(props: { title: string; subtitle?: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return <DashboardShell nav={NAV} {...props} />;
}
