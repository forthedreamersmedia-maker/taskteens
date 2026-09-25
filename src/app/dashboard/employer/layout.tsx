import { RequireRole } from "@/components/layout/require-role";
import { EmployerGate } from "@/components/dashboard/employer-gate";

export default function EmployerLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireRole roles={["employer"]}>
      <EmployerGate>{children}</EmployerGate>
    </RequireRole>
  );
}
