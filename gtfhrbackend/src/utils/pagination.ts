export interface CursorPage<T> {
  items: T[];
  hasMore: boolean;
  nextCursor: string | null;
}

/** Prisma arguments that fetch one extra row so `hasMore` is known without a second query. */
export function cursorArgs(cursor: string | undefined, limit: number) {
  return { take: limit + 1, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) };
}

export function toCursorPage<T extends { id: string }>(rows: T[], limit: number): CursorPage<T> {
  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit);
  return { items, hasMore, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null };
}
