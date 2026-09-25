"use client";
import { TeenShell } from "@/components/dashboard/teen-shell";
import { NotificationList } from "@/components/dashboard/notification-list";

export default function Page() {
  return (
    <TeenShell title="Notifications" subtitle="You're notified whenever an employer updates your application.">
      <NotificationList />
    </TeenShell>
  );
}
