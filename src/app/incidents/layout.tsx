import { RequireRole } from "@/components/layout/require-role";

export const metadata = { title: "Incident reports", robots: { index: false } };

export default function IncidentsLayout({ children }: { children: React.ReactNode }) {
  return <RequireRole roles={["teen", "parent", "employer", "admin"]}>{children}</RequireRole>;
}
