"use client";
import { BadgeCheck, ClipboardList, FileClock, Flag, LayoutDashboard, Settings2, Tags, Users } from "lucide-react";
import { DashboardShell } from "@/components/layout/dashboard-shell";

const NAV = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/admin/reports", label: "Reports & safety", icon: Flag },
  { href: "/admin/listings", label: "Listings", icon: ClipboardList },
  { href: "/admin/verifications", label: "Verifications", icon: BadgeCheck },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/categories", label: "Categories & areas", icon: Tags },
  { href: "/admin/settings", label: "Platform rules", icon: Settings2 },
  { href: "/admin/audit", label: "Audit log", icon: FileClock },
];

export function AdminShell(props: { title: string; subtitle?: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return <DashboardShell nav={NAV} {...props} />;
}
