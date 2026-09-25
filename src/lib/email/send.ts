import "server-only";
import { Resend } from "resend";
import type { EmailMessage } from "./templates";

let resend: Resend | null = null;

/**
 * Sends a transactional email via Resend. When RESEND_API_KEY is missing the
 * message is logged and skipped so flows still work in development.
 */
export async function sendEmail(msg: EmailMessage): Promise<"resend" | "skipped" | "failed"> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) {
    console.info(`[email:skipped] to=${msg.to} subject="${msg.subject}" (set RESEND_API_KEY and EMAIL_FROM to send)`);
    return "skipped";
  }
  resend ??= new Resend(key);
  try {
    const { error } = await resend.emails.send({ from, to: msg.to, subject: msg.subject, text: msg.text, html: msg.html });
    if (error) {
      console.error("[email:error]", error);
      return "failed";
    }
    return "resend";
  } catch (e) {
    console.error("[email:error]", e);
    return "failed";
  }
}
