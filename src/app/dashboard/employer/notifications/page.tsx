"use client";
import { EmployerShell } from "@/components/dashboard/employer-shell";
import { NotificationList } from "@/components/dashboard/notification-list";

export default function Page() {
  return <EmployerShell title="Notifications" subtitle="New applicants, interview responses and moderation updates."><NotificationList /></EmployerShell>;
}
