import Link from "next/link";
import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={cn("h-9 w-9", className)} aria-hidden="true">
      <rect width="40" height="40" rx="12" fill="#0B1F3A" />
      {/* bay wave + rising sun: local + growth */}
      <circle cx="26" cy="15" r="5.5" fill="#FF6B57" />
      <path d="M6 27c4-3.2 8-3.2 12 0s8 3.2 12 0 6-2.4 6-2.4V34H6z" fill="#2F6BFF" />
      <path d="M10 12h11M15.5 12v14" stroke="#FBF6EE" strokeWidth="3.2" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ className, light = false }: { className?: string; light?: boolean }) {
  return (
    <Link href="/" className={cn("group inline-flex items-center gap-2.5 rounded-xl", className)} aria-label="TaskTeens home">
      <LogoMark />
      <span className={cn("font-display text-xl font-extrabold tracking-tight", light ? "text-white" : "text-navy-800")}>
        Task<span className="text-coral-500">Teens</span>
      </span>
    </Link>
  );
}
