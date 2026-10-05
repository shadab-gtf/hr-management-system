import { randomBytes } from "node:crypto";
import type { TransactionClient } from "./transaction.js";

/** Next value of a named counter. Row-locked by the UPDATE, so concurrent transactions never share a number. */
export async function nextNumber(tx: TransactionClient, name: string): Promise<number> {
  const row = await tx.counter.upsert({
    where: { name },
    create: { name, value: 1 },
    update: { value: { increment: 1 } },
    select: { value: true },
  });
  return row.value;
}

/** Sequential employee id in the seed's format: `emp_0044`. */
export async function nextEmployeeId(tx: TransactionClient): Promise<string> {
  return `emp_${String(await nextNumber(tx, "employee")).padStart(4, "0")}`;
}

/**
 * Human-readable reference shown to users, e.g. `LV-2600042` for prefix `LV` in 2026. One counter per prefix.
 * `businessDate` is the organization-zone date (`todayInOrgZone()`).
 */
export async function nextReference(tx: TransactionClient, prefix: string, businessDate: string): Promise<string> {
  const value = await nextNumber(tx, `ref:${prefix}`);
  return `${prefix}-${businessDate.slice(2, 4)}${String(value).padStart(5, "0")}`;
}

/** Opaque, unguessable primary key: `<prefix>_<20 base32 chars>`. Prefixes are short lowercase words (`lv`, `tkt`). */
export function newId(prefix: string): string {
  const alphabet = "0123456789abcdefghjkmnpqrstvwxyz";
  const time = Date.now().toString(32).padStart(9, "0");
  const random = Array.from(randomBytes(11), (byte) => alphabet[byte % 32] ?? "0").join("");
  return `${prefix}_${time}${random}`;
}

/** Display code paired with a sequential employee id: `emp_0007` → `GTF-1007`. */
export function employeeCodeFor(employeeId: string): string {
  return `GTF-${1000 + Number(employeeId.slice(4))}`;
}
