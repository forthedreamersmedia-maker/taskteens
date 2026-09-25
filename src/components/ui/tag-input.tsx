"use client";
import { X } from "lucide-react";
import { useState } from "react";

/** Keyboard-friendly tag entry: type and press Enter or comma. */
export function TagInput({
  value,
  onChange,
  placeholder = "Type and press Enter",
  suggestions = [],
  id,
  ...aria
}: {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  suggestions?: string[];
  id?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
}) {
  const [draft, setDraft] = useState("");
  const add = (t: string) => {
    const v = t.trim().replace(/,$/, "");
    if (v && !value.some((x) => x.toLowerCase() === v.toLowerCase()) && value.length < 15) onChange([...value, v.slice(0, 40)]);
    setDraft("");
  };
  const unused = suggestions.filter((s) => !value.includes(s)).slice(0, 8);
  return (
    <div>
      <div className="input flex min-h-[44px] flex-wrap items-center gap-1.5 py-1.5" aria-invalid={aria["aria-invalid"]}>
        {value.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 rounded-full bg-navy-50 py-0.5 pl-2.5 pr-1 text-xs font-medium text-navy-700">
            {t}
            <button type="button" onClick={() => onChange(value.filter((x) => x !== t))} className="rounded-full p-0.5 hover:bg-navy-100" aria-label={`Remove ${t}`}>
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          id={id}
          value={draft}
          onChange={(e) => (e.target.value.endsWith(",") ? add(e.target.value) : setDraft(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(draft);
            } else if (e.key === "Backspace" && !draft && value.length) onChange(value.slice(0, -1));
          }}
          onBlur={() => draft && add(draft)}
          placeholder={value.length ? "" : placeholder}
          className="min-w-[8rem] flex-1 border-0 bg-transparent p-1 text-sm outline-none focus:ring-0"
          aria-describedby={aria["aria-describedby"]}
        />
      </div>
      {unused.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Suggestions">
          {unused.map((s) => (
            <button key={s} type="button" onClick={() => add(s)} className="rounded-full border border-dashed border-navy-200 px-2.5 py-0.5 text-xs text-navy-500 hover:border-bay-400 hover:text-bay-700">
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
