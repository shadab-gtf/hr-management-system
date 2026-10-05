/**
 * Form drafts — pure, DOM-free building blocks (keys, field policy, TTL, storage sweep).
 *
 * Storage layout (browser localStorage, per signed-in employee):
 *   key   `gtf-draft:v1:<employeeId>:<draftKey>`
 *   value `{"savedAt": <epoch ms>, "fields": {"<name>": ["<value>", ...]}}`
 *
 * A field's value list mirrors `FormData.getAll(name)`: one entry per text control with that name (in DOM
 * order), the checked values for a checkbox/radio group (an empty list when none is checked), and the
 * selected options for a multi-select.
 *
 * Drafts are a convenience, never a record: nothing here is sent to the API, every storage call is
 * wrapped so a blocked/private-mode storage silently disables drafts, and drafts expire after
 * DRAFT_TTL_MS.
 */

export const DRAFT_PREFIX = "gtf-draft:";
export const DRAFT_VERSION = "v1";
/** Remembers which employee owns the drafts in this browser; a different sign-in wipes them. */
export const DRAFT_OWNER_KEY = `${DRAFT_PREFIX}owner`;
export const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const DRAFT_DEBOUNCE_MS = 400;

/**
 * Field names that are NEVER written to a draft (fail closed: a false positive only means a field is not
 * restored). Covers credentials and one-time codes (password, otp, code, token, secret, pin, cvv) and
 * financial / statutory identifiers and pay data (account no/number, IFSC, PAN, Aadhaar, bank, salary,
 * CTC, UAN, ESIC).
 *
 * In addition, a control is never persisted when it is:
 * - `<input type="password" | "file" | "hidden">` or a button-like input (submit/reset/button/image);
 * - named `idempotencyKey` (the command's retry key);
 * - marked `data-no-draft` itself or inside an element marked `data-no-draft`;
 * - using `autocomplete` "one-time-code", "current-password", "new-password" or any "cc-*" token;
 * - unnamed (it would not be submitted either).
 */
export const SENSITIVE_FIELD_PATTERN =
  /password|otp|code|token|secret|pin|cvv|account.?(no|number)|ifsc|pan|aadhaar|bank|salary|ctc|uan|esic/i;

const EXCLUDED_INPUT_TYPES = new Set([
  "password",
  "file",
  "hidden",
  "submit",
  "reset",
  "button",
  "image",
]);
const EXCLUDED_NAMES = new Set(["idempotencyKey"]);
const SENSITIVE_AUTOCOMPLETE =
  /(^|\s)(one-time-code|current-password|new-password|cc-[a-z-]+)(\s|$)/i;

export type DraftFields = Record<string, string[]>;
export interface DraftRecord {
  savedAt: number;
  fields: DraftFields;
}

/** Minimal Storage surface so tests can pass an in-memory implementation. */
export interface DraftStorage {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** What the policy needs to know about a control (kept DOM-free for unit tests). */
export interface FieldDescriptor {
  name: string;
  /** `input.type`, or "select-one" / "select-multiple" / "textarea". */
  type: string;
  autocomplete?: string | null;
  /** True when the control or an ancestor carries `data-no-draft`. */
  noDraft?: boolean;
}

/** Draft keys are chosen by code (e.g. "leave.apply", "employee.edit:emp_0007"). */
export function isValidDraftKey(draftKey: string): boolean {
  return (
    draftKey.length > 0 &&
    draftKey.length <= 200 &&
    !/[\u0000-\u001f]/.test(draftKey)
  );
}

/** Percent-encodes anything outside `[A-Za-z0-9._:-]` so record ids with spaces or symbols stay storage-safe. */
export function encodeDraftKey(draftKey: string): string {
  return draftKey.replace(/[^A-Za-z0-9._:-]/g, (char) =>
    encodeURIComponent(char),
  );
}

export function buildStorageKey(employeeId: string, draftKey: string): string {
  return `${DRAFT_PREFIX}${DRAFT_VERSION}:${encodeURIComponent(employeeId)}:${encodeDraftKey(draftKey)}`;
}

/** Prefix of every draft key owned by one employee. */
export function employeePrefix(employeeId: string): string {
  return `${DRAFT_PREFIX}${DRAFT_VERSION}:${encodeURIComponent(employeeId)}:`;
}

export function isPersistableField(field: FieldDescriptor): boolean {
  if (!field.name) return false;
  if (field.noDraft) return false;
  if (EXCLUDED_INPUT_TYPES.has(field.type.toLowerCase())) return false;
  if (EXCLUDED_NAMES.has(field.name)) return false;
  if (SENSITIVE_FIELD_PATTERN.test(field.name)) return false;
  if (field.autocomplete && SENSITIVE_AUTOCOMPLETE.test(field.autocomplete))
    return false;
  return true;
}

export function isExpired(
  savedAt: number,
  now: number,
  ttl = DRAFT_TTL_MS,
): boolean {
  return (
    !Number.isFinite(savedAt) || now - savedAt > ttl || savedAt - now > 60_000
  );
}

/** Drops names the policy refuses — defence in depth for drafts written by an older build. */
export function sanitizeFields(fields: DraftFields): DraftFields {
  const clean: DraftFields = {};
  for (const [name, values] of Object.entries(fields)) {
    if (EXCLUDED_NAMES.has(name) || SENSITIVE_FIELD_PATTERN.test(name))
      continue;
    clean[name] = values;
  }
  return clean;
}

export function serializeDraft(fields: DraftFields, now: number): string {
  return JSON.stringify({
    savedAt: now,
    fields: sanitizeFields(fields),
  } satisfies DraftRecord);
}

/** Parses a stored value; returns null for anything malformed. */
export function parseDraft(raw: string | null): DraftRecord | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const { savedAt, fields } = value as { savedAt?: unknown; fields?: unknown };
  if (
    typeof savedAt !== "number" ||
    typeof fields !== "object" ||
    fields === null ||
    Array.isArray(fields)
  )
    return null;
  const out: DraftFields = {};
  for (const [name, values] of Object.entries(
    fields as Record<string, unknown>,
  )) {
    if (
      !Array.isArray(values) ||
      !values.every((item): item is string => typeof item === "string")
    )
      return null;
    out[name] = values;
  }
  return { savedAt, fields: sanitizeFields(out) };
}

/** True when the draft holds something worth restoring (any non-empty text or selection). */
export function hasContent(fields: DraftFields): boolean {
  return Object.values(fields).some((values) =>
    values.some((value) => value.trim() !== ""),
  );
}

/** Field-by-field equality (order-sensitive for text lists, order-insensitive for selections is not needed). */
export function sameFields(a: DraftFields, b: DraftFields): boolean {
  const names = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const name of names) {
    const left = a[name] ?? [];
    const right = b[name] ?? [];
    if (
      left.length !== right.length ||
      left.some((value, index) => value !== right[index])
    )
      return false;
  }
  return true;
}

function draftKeys(storage: DraftStorage): string[] {
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key && key.startsWith(DRAFT_PREFIX) && key !== DRAFT_OWNER_KEY)
      keys.push(key);
  }
  return keys;
}

/**
 * Removes expired or malformed drafts, drafts from an unknown format version and — when `employeeId`
 * is given — drafts that belong to any other employee. Returns the number of keys removed.
 */
export function sweepDrafts(
  storage: DraftStorage,
  now: number,
  employeeId?: string,
): number {
  const own = employeeId ? employeePrefix(employeeId) : null;
  const versioned = `${DRAFT_PREFIX}${DRAFT_VERSION}:`;
  let removed = 0;
  for (const key of draftKeys(storage)) {
    const foreign = own !== null && !key.startsWith(own);
    const stale =
      !key.startsWith(versioned) ||
      isExpired(parseDraft(storage.getItem(key))?.savedAt ?? Number.NaN, now);
    if (foreign || stale) {
      storage.removeItem(key);
      removed += 1;
    }
  }
  return removed;
}

/** Removes every gtf-draft:* key (sign-out). */
export function clearAllDrafts(storage: DraftStorage): void {
  for (const key of draftKeys(storage)) storage.removeItem(key);
  storage.removeItem(DRAFT_OWNER_KEY);
}

/**
 * Records the signed-in employee. When a different employee signs in on this browser, every existing
 * draft is wiped before the new owner is stored; then expired drafts are swept.
 */
export function claimDraftOwner(
  storage: DraftStorage,
  employeeId: string,
  now: number,
): void {
  const owner = storage.getItem(DRAFT_OWNER_KEY);
  if (owner !== employeeId) {
    clearAllDrafts(storage);
    storage.setItem(DRAFT_OWNER_KEY, employeeId);
  }
  sweepDrafts(storage, now, employeeId);
}

export function readDraft(
  storage: DraftStorage,
  employeeId: string,
  draftKey: string,
  now: number,
): DraftRecord | null {
  const key = buildStorageKey(employeeId, draftKey);
  const record = parseDraft(storage.getItem(key));
  if (!record || isExpired(record.savedAt, now)) {
    if (storage.getItem(key) !== null) storage.removeItem(key);
    return null;
  }
  return record;
}

export function writeDraft(
  storage: DraftStorage,
  employeeId: string,
  draftKey: string,
  fields: DraftFields,
  now: number,
): void {
  storage.setItem(
    buildStorageKey(employeeId, draftKey),
    serializeDraft(fields, now),
  );
}

export function removeDraft(
  storage: DraftStorage,
  employeeId: string,
  draftKey: string,
): void {
  storage.removeItem(buildStorageKey(employeeId, draftKey));
}

/** Browser localStorage, or null when unavailable (SSR, private mode, blocked site data). */
export function browserStorage(): DraftStorage | null {
  try {
    if (typeof window === "undefined") return null;
    const storage = window.localStorage;
    return storage ?? null;
  } catch {
    return null;
  }
}

/** Runs a storage operation, swallowing quota / security errors. */
export function safely<T>(run: (storage: DraftStorage) => T, fallback: T): T {
  const storage = browserStorage();
  if (!storage) return fallback;
  try {
    return run(storage);
  } catch {
    return fallback;
  }
}
