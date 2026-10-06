import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** Spec §18: wording TaskTeens must never use in product copy. */
const BANNED: RegExp[] = [
  /completely safe/i,
  /fully vetted/i,
  /guaranteed protection/i,
  /guaranteed (parent )?notification/i,
  /background[- ]checked/i,
  /identity verified/i,
  /age verified/i,
  /assumes no liability whatsoever/i,
  /911 (was|has been) called/i,
  /we called 911/i,
];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.(tsx?|md|sql)$/.test(n) ? [p] : [];
  });
}

describe("banned safety language", () => {
  const roots = ["src", "supabase/migrations"];
  for (const root of roots) {
    it(`does not appear in ${root}`, () => {
      const hits: string[] = [];
      for (const f of files(root)) {
        const lines = readFileSync(f, "utf8").split("\n");
        lines.forEach((line, i) => {
          // Lines that explicitly reference the rule (e.g. "never say 911 was called") are allowed when marked.
          if (line.includes("banned-language-ok")) return;
          for (const re of BANNED) if (re.test(line)) hits.push(`${f}:${i + 1}: ${line.trim().slice(0, 120)}`);
        });
      }
      expect(hits).toEqual([]);
    });
  }
});
