import { createHash } from "node:crypto";
import { compare, hash } from "bcryptjs";

const COST_FACTOR = 12;
const weakStems = ["password", "passw0rd", "qwerty", "welcome", "admin", "letmein", "iloveyou", "changeme"];

function prehash(password: string): string {
  return createHash("sha256").update(password.normalize("NFC"), "utf8").digest("base64");
}

/** Length in Unicode code points, so one emoji or accented letter counts once. */
function codePointLength(password: string): number {
  return Array.from(password.normalize("NFC")).length;
}

function passwordIssue(password: string): string | null {
  const normalized = password.normalize("NFKC").toLowerCase();
  const compact = normalized.replace(/\s+/g, "");
  if (codePointLength(password) < 15 || codePointLength(password) > 128)
    return "Password must be between 15 and 128 characters.";
  if (/^(.)\1+$/u.test(compact) || /^(.{1,4})\1+$/u.test(compact))
    return "Choose a password that is not a repeated pattern.";
  if (weakStems.some((stem) => compact.startsWith(stem) && /^[\d\W_]*$/u.test(compact.slice(stem.length))))
    return "Choose a less common password.";
  return null;
}

export async function hashPassword(password: string): Promise<string> {
  const issue = passwordIssue(password);
  if (issue) throw new Error(issue);
  return hash(prehash(password), COST_FACTOR);
}

export async function verifyPassword(password: string, encodedHash: string): Promise<boolean> {
  if (codePointLength(password) > 128) return false;
  return compare(prehash(password), encodedHash);
}
