"use client";
import { Suspense } from "react";
import { EmployerShell } from "@/components/dashboard/employer-shell";
import { MessagesView } from "@/components/safety/messages-view";

export default function Page() {
  return <EmployerShell title="Messages" subtitle="All communication with teens happens here. The teen's parent or guardian can read every message."><Suspense><MessagesView role="employer" /></Suspense></EmployerShell>;
}
