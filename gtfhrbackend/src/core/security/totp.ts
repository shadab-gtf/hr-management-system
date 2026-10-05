import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function generateTotpSecret(): string {
  const bytes = randomBytes(20);
  let bits = "";
  for (const byte of bytes) bits += byte.toString(2).padStart(8, "0");
  return (
    bits
      .match(/.{5}/g)
      ?.map((chunk) => alphabet[parseInt(chunk, 2)])
      .join("") ?? ""
  );
}
export function totpCode(secret: string, step: number): string {
  const bits = Array.from({ length: secret.length }, (_v, index) =>
    alphabet.indexOf(secret.charAt(index)).toString(2).padStart(5, "0"),
  ).join("");
  const key = Buffer.from(bits.match(/.{8}/g)?.map((b) => parseInt(b, 2)) ?? []);
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac("sha1", key).update(counter).digest();
  const offset = (digest[19] ?? 0) & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}
export function verifyTotp(secret: string, code: string, lastStep: bigint | null, now = Date.now()): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const step = Math.floor(now / 30_000);
  for (const candidate of [step - 1, step, step + 1])
    if (
      (lastStep === null || BigInt(candidate) > lastStep) &&
      timingSafeEqual(Buffer.from(totpCode(secret, candidate)), Buffer.from(code))
    )
      return candidate;
  return null;
}
