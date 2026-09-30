import "server-only";

/** Deterministic hash → [0, 1). Same inputs always produce the same fixture. */
export function seeded(...parts: (string | number)[]): number {
  let hash = 2166136261;
  for (const char of parts.join("|")) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  // mulberry32 finalizer
  let t = (hash += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function seededInt(min: number, max: number, ...parts: (string | number)[]) {
  return min + Math.floor(seeded(...parts) * (max - min + 1));
}

/** Integer paise → exact decimal rupee string. */
export function paise(value: number): string {
  const negative = value < 0;
  const abs = Math.abs(Math.round(value));
  const rupees = Math.floor(abs / 100);
  const rest = String(abs % 100).padStart(2, "0");
  return `${negative ? "-" : ""}${rupees}.${rest}`;
}
export function inr(valuePaise: number) {
  return { amount: paise(valuePaise), currency: "INR" as const };
}
/** Leave half-units (1 = 0.5 day) → exact decimal string. */
export function halves(value: number): string {
  return value % 2 === 0 ? `${value / 2}` : `${(value - 1) / 2}.5`;
}
