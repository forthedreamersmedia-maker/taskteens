"use client";
import { ParentShell } from "@/components/dashboard/parent-shell";
import { NotificationList } from "@/components/dashboard/notification-list";

export default function Page() {
  return (
    <ParentShell title="Notifications" subtitle="Applications, approvals, messages and safety alerts about your teen.">
      <NotificationList />
    </ParentShell>
  );
}
