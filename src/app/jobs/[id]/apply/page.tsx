import { ApplyForm } from "@/components/jobs/apply-form";
import { RequireRole } from "@/components/layout/require-role";

export const metadata = { title: "Apply" };

export default async function ApplyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <RequireRole roles={["teen"]}>
      <ApplyForm jobId={id} />
    </RequireRole>
  );
}
