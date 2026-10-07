import "server-only";
import { randomInt } from "node:crypto";
import { hashToken } from "./tokens";

/** 6-digit numeric code for SMS. */
export function numericCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}
/** 8-character code for mailed address cards (no ambiguous characters). */
export function mailCode(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 8 }, () => alphabet[randomInt(0, alphabet.length)]).join("");
}
export function hashCode(userId: string, code: string): string {
  return hashToken(`${userId}:${code.trim().toUpperCase()}`);
}
