"use client";
import { Suspense } from "react";
import { TeenShell } from "@/components/dashboard/teen-shell";
import { MessagesView } from "@/components/safety/messages-view";

export default function Page() {
  return <TeenShell title="Messages" subtitle="Talk with employers here — never share your phone, email or social handles. Your parent or guardian can read these messages."><Suspense><MessagesView role="teen" /></Suspense></TeenShell>;
}
