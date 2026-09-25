import { LogoMark } from "@/components/ui/logo";

export function AuthCard({ title, subtitle, children, footer }: { title: string; subtitle?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="container-page flex min-h-[70vh] items-center justify-center py-12">
      <div className="w-full max-w-md">
        <div className="card p-6 sm:p-8">
          <LogoMark className="h-10 w-10" />
          <h1 className="mt-5 text-2xl font-bold">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-navy-500">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
        {footer && <div className="mt-5 text-center text-sm text-navy-500">{footer}</div>}
      </div>
    </div>
  );
}
