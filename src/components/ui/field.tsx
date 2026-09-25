import { AlertCircle } from "lucide-react";
import { cloneElement, isValidElement, useId, type ReactElement } from "react";
import { cn } from "@/lib/utils";

/**
 * Accessible form field: wires label, hint and error to the control via id / aria-describedby / aria-invalid.
 */
export function Field({
  label,
  hint,
  error,
  required,
  children,
  className,
  optional,
}: {
  label: string;
  hint?: React.ReactNode;
  error?: string;
  required?: boolean;
  optional?: boolean;
  children: ReactElement<Record<string, unknown>>;
  className?: string;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  const control = isValidElement(children)
    ? cloneElement(children, {
        id: (children.props.id as string) ?? id,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": [hintId, errId].filter(Boolean).join(" ") || undefined,
        "aria-required": required || undefined,
      })
    : children;
  return (
    <div className={className}>
      <label htmlFor={(children.props.id as string) ?? id} className="label">
        {label}
        {required && <span className="ml-0.5 text-coral-600" aria-hidden="true">*</span>}
        {optional && <span className="ml-1.5 text-xs font-normal text-navy-400">Optional</span>}
      </label>
      {control}
      {hint && !error && (
        <p id={hintId} className="hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={errId} className="field-error">
          <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  );
}

export function FieldsetGroup({ legend, children, error, className, hint }: { legend: string; children: React.ReactNode; error?: string; className?: string; hint?: string }) {
  return (
    <fieldset className={cn(className)} aria-invalid={error ? true : undefined}>
      <legend className="label">{legend}</legend>
      {hint && <p className="-mt-1 mb-2 text-xs text-navy-400">{hint}</p>}
      {children}
      {error && (
        <p className="field-error" role="alert">
          <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
    </fieldset>
  );
}
