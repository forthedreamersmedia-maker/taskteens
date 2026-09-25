"use client";
import { FlaskConical } from "lucide-react";
import Link from "next/link";
import { isDemoMode } from "@/lib/config";

export function DemoBanner() {
  if (!isDemoMode) return null;
  return (
    <div className="bg-amber-100 text-amber-900">
      <div className="container-page flex flex-wrap items-center justify-center gap-x-3 gap-y-1 py-2 text-center text-xs sm:text-sm">
        <FlaskConical className="h-4 w-4" aria-hidden="true" />
        <span>
          <strong>Local demonstration mode.</strong> Data is stored in this browser only, listings are fictional, and emails go to an on-screen outbox.
        </span>
        <Link href="/demo" className="font-semibold underline underline-offset-2">Demo accounts &amp; outbox</Link>
      </div>
    </div>
  );
}
