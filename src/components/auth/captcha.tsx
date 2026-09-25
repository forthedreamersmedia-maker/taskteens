"use client";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { TURNSTILE_SITE_KEY } from "@/lib/config";

type Turnstile = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id?: string) => void;
  remove: (id?: string) => void;
};
declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let scriptPromise: Promise<void> | null = null;
function loadScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => {
      scriptPromise = null;
      reject(new Error("captcha script failed"));
    };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

export interface CaptchaHandle {
  /** Turnstile tokens are single-use: call after every submit attempt. */
  reset: () => void;
}

/**
 * Cloudflare Turnstile widget. Renders nothing when NEXT_PUBLIC_TURNSTILE_SITE_KEY is unset.
 * Calls onToken(token) when solved and onToken(null) when it expires or errors.
 */
export const Captcha = forwardRef<CaptchaHandle, { onToken: (t: string | null) => void; action?: string; error?: string }>(function Captcha(
  { onToken, action, error },
  ref,
) {
  const el = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const cb = useRef(onToken);
  cb.current = onToken;
  const [loadError, setLoadError] = useState(false);

  useImperativeHandle(ref, () => ({
    reset: () => {
      cb.current(null);
      if (widget.current && window.turnstile) window.turnstile.reset(widget.current);
    },
  }));

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return;
    let cancelled = false;
    loadScript()
      .then(() => {
        if (cancelled || !el.current || !window.turnstile || widget.current) return;
        widget.current = window.turnstile.render(el.current, {
          sitekey: TURNSTILE_SITE_KEY,
          action,
          theme: "light",
          size: "flexible",
          callback: (t: string) => cb.current(t),
          "expired-callback": () => cb.current(null),
          "error-callback": () => cb.current(null),
        });
      })
      .catch(() => !cancelled && setLoadError(true));
    return () => {
      cancelled = true;
      if (widget.current && window.turnstile) window.turnstile.remove(widget.current);
      widget.current = null;
    };
  }, [action]);

  if (!TURNSTILE_SITE_KEY) return null;
  return (
    <div>
      <div ref={el} className="min-h-[65px]" aria-label="Security check" />
      {loadError && <p className="field-error">The security check couldn&apos;t load. Check your connection or turn off content blockers, then refresh.</p>}
      {error && <p className="field-error">{error}</p>}
    </div>
  );
});
