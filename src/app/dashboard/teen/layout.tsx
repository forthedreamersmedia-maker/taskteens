import { RequireRole } from "@/components/layout/require-role";
import { LocationSharingProvider } from "@/components/safety/location-sharing";

export default function TeenLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireRole roles={["teen"]}>
      <LocationSharingProvider>{children}</LocationSharingProvider>
    </RequireRole>
  );
}
