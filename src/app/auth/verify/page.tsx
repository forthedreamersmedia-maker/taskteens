"use client";
import { MailCheck } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { AuthCard } from "@/components/layout/auth-card";
import { Alert } from "@/components/ui/feedback";
import { useData } from "@/lib/auth-context";
import { errorMessage } from "@/lib/utils";

function Verify() {
  const email = useSearchParams().get("email") ?? "";
  const data = useData();
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  return (
    <AuthCard title="Confirm your email" subtitle={<>We sent a verification link to <strong>{email || "your inbox"}</strong>. Open it to activate your account.</>} footer={<Link href="/auth/sign-in" className="link">Back to sign in</Link>}>
      <MailCheck className="h-10 w-10 text-bay-500" aria-hidden="true" />
      <p className="mt-3 text-sm text-navy-500">Didn&apos;t get it? Check spam, or resend the link.</p>
      {msg && <Alert tone={msg.tone} className="mt-3">{msg.text}</Alert>}
      <button
        type="button"
        className="btn-outline mt-4 w-full"
        disabled={!email}
        onClick={async () => {
          try {
            await data.resendVerification(email);
            setMsg({ tone: "success", text: "Verification email re-sent." });
          } catch (e) {
            setMsg({ tone: "error", text: errorMessage(e) });
          }
        }}
      >
        Resend verification email
      </button>
    </AuthCard>
  );
}
export default function Page() {
  return <Suspense><Verify /></Suspense>;
}
