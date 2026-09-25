"use client";
import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/** Accessible modal built on the native <dialog> element (focus trap + Esc handled by the browser). */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-labelledby="modal-title"
      className={cn(
        "w-[calc(100%-2rem)] rounded-3xl border border-navy-100 bg-white p-0 text-navy-800 shadow-lift backdrop:bg-navy-900/50 backdrop:backdrop-blur-sm",
        size === "sm" && "max-w-md",
        size === "md" && "max-w-lg",
        size === "lg" && "max-w-2xl",
      )}
    >
      {open && (
        <div className="max-h-[85vh] overflow-y-auto p-6">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h2 id="modal-title" className="text-lg font-bold">
                {title}
              </h2>
              {description && <p className="mt-1 text-sm text-navy-500">{description}</p>}
            </div>
            <button type="button" onClick={onClose} className="rounded-full p-1.5 text-navy-400 hover:bg-navy-50 hover:text-navy-700" aria-label="Close dialog">
              <X className="h-5 w-5" />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
