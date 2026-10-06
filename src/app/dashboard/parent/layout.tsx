import { RequireRole } from "@/components/layout/require-role";

export const metadata = { title: "Parent dashboard", robots: { index: false } };
export default function ParentLayout({ children }: { children: React.ReactNode }) {
  return <RequireRole roles={["parent"]}>{children}</RequireRole>;
}
