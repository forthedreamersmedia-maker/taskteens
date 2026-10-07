"use client";
import type { SupabaseClient } from "@supabase/supabase-js";

export const INCIDENT_CATEGORIES = [
  { id: "safety_emergency", label: "Someone was in danger", hint: "Threats, unsafe situation, being kept from leaving" },
  { id: "harassment", label: "Harassment or inappropriate behavior", hint: "Comments, touching, pressure to meet or share contact info" },
  { id: "injury", label: "Someone was hurt", hint: "Injury during the job" },
  { id: "missing_person", label: "Someone is missing or can't be reached", hint: "" },
  { id: "lost_pet", label: "A pet got lost or hurt", hint: "" },
  { id: "property_damage", label: "Something was damaged", hint: "" },
  { id: "payment_dispute", label: "Payment problem", hint: "Not paid, paid less than agreed" },
  { id: "job_different", label: "The job was different than described", hint: "Different tasks, location, hours or supervision" },
  { id: "other", label: "Something else", hint: "" },
] as const;
export type IncidentCategory = (typeof INCIDENT_CATEGORIES)[number]["id"];
export const categoryLabel = (c: string) => INCIDENT_CATEGORIES.find((x) => x.id === c)?.label ?? c.replace(/_/g, " ");

export const STATUS_LABEL: Record<string, string> = {
  open: "Received", urgent: "Urgent — under review", awaiting_response: "Waiting for responses", referred: "Referred to outside authorities",
  substantiated: "Closed — supported", unsubstantiated: "Closed — not supported", inconclusive: "Closed — inconclusive", resolved: "Closed — resolved",
};
export const CLOSED = new Set(["substantiated", "unsubstantiated", "inconclusive", "resolved"]);

export const EVIDENCE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "video/mp4", "video/quicktime", "application/pdf"];
export const EVIDENCE_ACCEPT = EVIDENCE_TYPES.join(",");
export const MAX_EVIDENCE_BYTES = 25 * 1024 * 1024;

const EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/heif": "heif",
  "video/mp4": "mp4", "video/quicktime": "mov", "application/pdf": "pdf",
};

async function sha256(file: File): Promise<string | null> {
  try {
    const buf = await file.arrayBuffer();
    const hash = await crypto.subtle.digest("SHA-256", buf);
    return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return null;
  }
}

/**
 * Uploads one evidence file to the private bucket, then records it. The file's own timestamp and name are
 * stored as "reported by the device" — they can be missing or altered and are never treated as proof.
 */
export async function uploadEvidence(
  sb: SupabaseClient, uid: string, file: File,
  target: { phase: "incident"; incidentId: string } | { phase: "before" | "after"; applicationId: string },
  caption?: string,
): Promise<string> {
  if (!EVIDENCE_TYPES.includes(file.type)) throw new Error(`${file.name}: only photos, videos (MP4/MOV) and PDFs can be uploaded.`);
  if (file.size > MAX_EVIDENCE_BYTES) throw new Error(`${file.name} is larger than 25 MB.`);
  const path = `${uid}/${crypto.randomUUID()}.${EXT[file.type]}`;
  const hash = await sha256(file);
  const { error: upErr } = await sb.storage.from("incident-evidence").upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) throw new Error(`${file.name}: ${upErr.message}`);
  const metadata = file.lastModified ? { last_modified: new Date(file.lastModified).toISOString(), name: file.name } : { name: file.name };
  const { data, error } = await sb.rpc("register_evidence", {
    p_application: target.phase === "incident" ? null : target.applicationId,
    p_incident: target.phase === "incident" ? target.incidentId : null,
    p_phase: target.phase, p_path: path, p_mime: file.type, p_size: file.size, p_sha256: hash, p_metadata: metadata, p_caption: caption ?? null,
  });
  if (error) throw new Error(`${file.name}: ${error.message}`);
  return data as string;
}

export const FLAG_LABEL: Record<string, string> = {
  duplicate_file: "Same file was uploaded before",
  missing_device_metadata: "No file date from the device",
  timestamp_in_future: "File date is in the future",
  uploaded_long_after_job: "Uploaded more than 48 hours after the job",
};
