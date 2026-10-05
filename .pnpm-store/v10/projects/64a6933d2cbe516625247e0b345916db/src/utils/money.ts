/** Wire money: exact decimal string in rupees, never a float (`types/common.ts` moneySchema). */
export interface Money {
  amount: string;
  currency: "INR";
}

/** Integer paise → `{ amount: "1234.50", currency: "INR" }`. Accepts bigint (Prisma BigInt columns). */
export function inr(paise: number | bigint): Money {
  const value = BigInt(paise);
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const rupees = absolute / 100n;
  const remainder = absolute % 100n;
  return { amount: `${negative ? "-" : ""}${rupees}.${remainder.toString().padStart(2, "0")}`, currency: "INR" };
}

/** `"1234.5"` / `"1234.50"` / `"1234"` → 123450 paise. Throws on more than two decimals or non-numeric input. */
export function paiseFromAmount(amount: string): number {
  const match = /^(-)?(\d+)(?:\.(\d{1,2}))?$/.exec(amount.trim());
  if (!match?.[2]) throw new RangeError(`Invalid money amount: ${amount}`);
  const paise = Number(match[2]) * 100 + Number((match[3] ?? "0").padEnd(2, "0"));
  if (!Number.isSafeInteger(paise)) throw new RangeError("Money amount is too large.");
  return match[1] ? -paise : paise;
}

/** Rupees (as stored in the mock seed, e.g. `annualCtc: 1800000`) → paise. */
export function paiseFromRupees(rupees: number): number {
  return Math.round(rupees * 100);
}
