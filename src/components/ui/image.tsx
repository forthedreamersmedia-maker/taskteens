"use client";
import { ImageOff } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

/** <img> with graceful gradient fallback when the photo fails or is missing. */
export function SafeImage({ src, alt, className, fallbackLabel }: { src: string | null | undefined; alt: string; className?: string; fallbackLabel?: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div
        role="img"
        aria-label={alt}
        className={cn("flex items-center justify-center bg-gradient-to-br from-navy-700 via-bay-600 to-coral-400 text-white/85", className)}
      >
        <div className="flex flex-col items-center gap-1 px-3 text-center">
          <ImageOff className="h-5 w-5" aria-hidden="true" />
          {fallbackLabel && <span className="text-xs font-semibold">{fallbackLabel}</span>}
        </div>
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} className={cn("object-cover", className)} />;
}
