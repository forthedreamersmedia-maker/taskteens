import { RequireRole } from "@/components/layout/require-role";

export const metadata = { title: "Admin", robots: { index: false } };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <RequireRole roles={["admin"]}>{children}</RequireRole>;
}
