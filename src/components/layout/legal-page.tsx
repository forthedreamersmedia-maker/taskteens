import { Info } from "lucide-react";

export function LegalPage({
  title,
  updated,
  effective,
  children,
  intro,
  toc,
  reviewed = false,
}: {
  title: string;
  updated: string;
  effective?: string;
  intro?: string;
  toc?: React.ReactNode;
  reviewed?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="container-page max-w-3xl py-12">
      {!reviewed && (
        <div role="note" className="flex gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <Info className="h-5 w-5 shrink-0" aria-hidden="true" />
          <p>
            <strong>Pre-launch version.</strong> TaskTeens is in an early pilot. This document is being finalized and may change before public launch.
          </p>
        </div>
      )}
      <h1 className="mt-8 text-4xl font-extrabold">{title}</h1>
      <p className="mt-2 text-sm text-navy-400">
        {effective ? <>Effective date: {effective} · </> : null}Last updated: {updated}
      </p>
      {intro && <p className="mt-6 text-lg leading-8 text-navy-600">{intro}</p>}
      {toc}
      <div className="prose-legal mt-6">{children}</div>
    </div>
  );
}
