import { z } from "zod";

/** Business calendar date, `YYYY-MM-DD`, interpreted in the organization zone. */
export const isoDateSchema = z.iso.date();
/** RFC 3339 UTC instant. */
export const instantSchema = z.iso.datetime({ offset: true });
/** Exact decimal string; never a binary float on the wire. */
export const decimalSchema = z.string().regex(/^-?\d+(\.\d+)?$/);

export const moneySchema = z.object({
  amount: decimalSchema,
  currency: z.literal("INR"),
});

export const toneSchema = z.enum([
  "neutral",
  "success",
  "warning",
  "info",
  "danger",
]);

export const personRefSchema = z.object({
  id: z.string(),
  name: z.string(),
  initials: z.string(),
  designation: z.string(),
});

export const listMetaSchema = z.object({
  requestId: z.string(),
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
  total: z.number().int().nonnegative().optional(),
});

/** Normalized list; the transport maps the API's `{ data: T[], meta }`. */
export function listSchema<T extends z.ZodType>(item: T) {
  return z.object({ items: z.array(item), meta: listMetaSchema });
}

export type IsoDate = z.infer<typeof isoDateSchema>;
export type Instant = z.infer<typeof instantSchema>;
export type Money = z.infer<typeof moneySchema>;
export type Tone = z.infer<typeof toneSchema>;
export type PersonRef = z.infer<typeof personRefSchema>;
export type ListMeta = z.infer<typeof listMetaSchema>;
export interface ListResult<T> {
  items: T[];
  meta: ListMeta;
}
