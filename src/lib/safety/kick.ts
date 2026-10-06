"use client";
/** Asks the server to send any queued notification emails now (fire-and-forget). */
export function kickNotifications() {
  fetch("/api/notifications/dispatch", { method: "POST" }).catch(() => undefined);
}
