import { AlertTriangle } from "lucide-react";

export function LegalPage({ title, updated, children, intro }: { title: string; updated: string; intro?: string; children: React.ReactNode }) {
  return (
    <div className="container-page max-w-3xl py-12">
      <div role="note" className="flex gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden="true" />
        <p>
          <strong>Starter draft — not legal advice.</strong> This page contains placeholder language written for an MVP. It must be reviewed and
          adapted by a qualified attorney (including for California and federal rules on minors, privacy and employment) before TaskTeens launches publicly.
        </p>
      </div>
      <h1 className="mt-8 text-4xl font-extrabold">{title}</h1>
      <p className="mt-2 text-sm text-navy-400">Draft last updated {updated}</p>
      {intro && <p className="mt-6 text-lg leading-8 text-navy-600">{intro}</p>}
      <div className="prose-legal mt-6">{children}</div>
    </div>
  );
}
