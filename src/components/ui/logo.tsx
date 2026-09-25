import Link from "next/link";
import { cn } from "@/lib/utils";

/** T/T monogram from the TaskTeens brand mark. */
export function LogoMark({ className, light = false }: { className?: string; light?: boolean }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={light ? "/logo-mark-white.png" : "/logo-mark.png"} alt="" aria-hidden="true" width={434} height={474} className={cn("h-9 w-auto", className)} />;
}

export function Logo({ className, light = false }: { className?: string; light?: boolean }) {
  return (
    <Link href="/" className={cn("group inline-flex items-center gap-3 rounded-xl", className)} aria-label="TaskTeens home">
      <LogoMark light={light} className="h-9" />
      <span className="flex flex-col leading-none">
        <span className={cn("font-brand text-[15px] font-medium uppercase tracking-[0.32em]", light ? "text-white" : "text-navy-800")}>TaskTeens</span>
        <span className={cn("mt-1 font-brand text-[9px] font-medium uppercase tracking-[0.38em]", light ? "text-white/70" : "text-navy-400")}>Bay Area Built</span>
      </span>
    </Link>
  );
}
