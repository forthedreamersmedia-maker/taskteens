import { RequireRole } from "@/components/layout/require-role";

export default function TeenLayout({ children }: { children: React.ReactNode }) {
  return <RequireRole roles={["teen"]}>{children}</RequireRole>;
}
