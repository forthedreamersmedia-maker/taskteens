import { Alert } from "@/components/ui/feedback";

export function RequiresBackend({ feature }: { feature: string }) {
  return (
    <Alert tone="info" title="Requires the live backend">
      {feature} uses the live TaskTeens database and isn&apos;t available in demo mode.
    </Alert>
  );
}
