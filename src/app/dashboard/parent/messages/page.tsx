"use client";
import { Suspense } from "react";
import { ParentShell } from "@/components/dashboard/parent-shell";
import { MessagesView } from "@/components/safety/messages-view";

export default function Page() {
  return <ParentShell title="Messages" subtitle="You can read every message between your teen and employers, including ones held for containing contact details. Replies you send are labeled “Parent/Guardian message”."><Suspense><MessagesView role="parent" /></Suspense></ParentShell>;
}
