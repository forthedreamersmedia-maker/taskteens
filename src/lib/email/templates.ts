import { APPLICATION_STATUS_LABEL, SITE_NAME } from "../constants";
import type { ApplicationStatus } from "../types";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

const wrap = (title: string, body: string, ctaUrl?: string, ctaLabel?: string) => `
<div style="font-family:Inter,Arial,sans-serif;background:#FBF6EE;padding:24px">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;padding:28px;border:1px solid #EADBC3">
    <div style="font-weight:800;font-size:20px;color:#0B1F3A">Task<span style="color:#FF6B57">Teens</span></div>
    <h1 style="font-size:20px;color:#0B1F3A;margin:20px 0 8px">${title}</h1>
    <div style="color:#334155;font-size:15px;line-height:1.6">${body}</div>
    ${ctaUrl ? `<p style="margin:24px 0"><a href="${ctaUrl}" style="background:#2F6BFF;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:600">${ctaLabel}</a></p>` : ""}
    <p style="color:#64748B;font-size:12px;margin-top:28px">Safety reminder: never share your home address, Social Security number or bank details through TaskTeens. Meet in public places and bring a trusted adult to interviews. Report concerns at ${"{SITE}"}/report.</p>
  </div>
</div>`;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function employerNewApplicationEmail(p: {
  to: string; site: string; employerName: string; jobTitle: string; applicantFirstName: string; applicationId: string;
}): EmailMessage {
  const url = `${p.site}/dashboard/employer/applications/${p.applicationId}`;
  const subject = `New application: ${p.jobTitle}`;
  const text = `Hi ${p.employerName},\n\n${p.applicantFirstName} just applied to "${p.jobTitle}" on ${SITE_NAME}. The application is already in your employer dashboard:\n${url}\n\nPlease review it and update the status so the applicant knows where things stand.\n\n— ${SITE_NAME}`;
  const html = wrap(
    "You have a new applicant",
    `<p>Hi ${esc(p.employerName)},</p><p><strong>${esc(p.applicantFirstName)}</strong> just applied to <strong>${esc(p.jobTitle)}</strong>. The full application is waiting in your dashboard.</p><p>Please review it and update the status — applicants are notified automatically.</p>`,
    url,
    "Review application",
  ).replace("{SITE}", p.site);
  return { to: p.to, subject, text, html };
}

export function teenConfirmationEmail(p: { to: string; site: string; teenFirstName: string; jobTitle: string; employerName: string }): EmailMessage {
  const url = `${p.site}/dashboard/teen/applications`;
  const subject = `Application sent: ${p.jobTitle}`;
  const text = `Hi ${p.teenFirstName},\n\nYour application for "${p.jobTitle}" with ${p.employerName} was delivered to the employer's dashboard. You'll get a notification when they update your status.\n\nTrack it here: ${url}\n\nSafety reminder: interviews should happen in a public place or over video, and a parent or guardian is always welcome.\n\n— ${SITE_NAME}`;
  const html = wrap(
    "Your application was sent",
    `<p>Hi ${esc(p.teenFirstName)},</p><p>Your application for <strong>${esc(p.jobTitle)}</strong> with <strong>${esc(p.employerName)}</strong> is now in the employer's dashboard. We'll notify you when they update your status.</p>`,
    url,
    "Track my applications",
  ).replace("{SITE}", p.site);
  return { to: p.to, subject, text, html };
}

export function statusUpdateEmail(p: { to: string; site: string; teenFirstName: string; jobTitle: string; employerName: string; status: ApplicationStatus; message?: string }): EmailMessage {
  const url = `${p.site}/dashboard/teen/applications`;
  const label = APPLICATION_STATUS_LABEL[p.status];
  const subject = `Update on your application: ${label}`;
  const text = `Hi ${p.teenFirstName},\n\n${p.employerName} updated your application for "${p.jobTitle}" to: ${label}.${p.message ? `\n\nMessage from the employer:\n${p.message}` : ""}\n\nSee details: ${url}\n\n— ${SITE_NAME}`;
  const html = wrap(
    `Status update: ${esc(label)}`,
    `<p>Hi ${esc(p.teenFirstName)},</p><p><strong>${esc(p.employerName)}</strong> updated your application for <strong>${esc(p.jobTitle)}</strong> to <strong>${esc(label)}</strong>.</p>${p.message ? `<blockquote style="border-left:3px solid #FF6B57;margin:12px 0;padding-left:12px">${esc(p.message)}</blockquote>` : ""}`,
    url,
    "View in dashboard",
  ).replace("{SITE}", p.site);
  return { to: p.to, subject, text, html };
}

export function safetyReportEmail(p: { to: string; site: string; severity: string; reason: string; details: string; reportId: string }): EmailMessage {
  const subject = `[${p.severity.toUpperCase()}] TaskTeens safety report: ${p.reason}`;
  const text = `Report ${p.reportId}\nSeverity: ${p.severity}\nReason: ${p.reason}\n\n${p.details}\n\nReview: ${p.site}/admin/reports`;
  return { to: p.to, subject, text, html: `<pre style="font-family:inherit;white-space:pre-wrap">${esc(text)}</pre>` };
}
