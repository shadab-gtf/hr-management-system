// Unit tests for the pure draft helpers. Run: node --test lib/drafts/draft-core.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DRAFT_OWNER_KEY,
  DRAFT_TTL_MS,
  buildStorageKey,
  claimDraftOwner,
  clearAllDrafts,
  hasContent,
  isExpired,
  isPersistableField,
  isValidDraftKey,
  parseDraft,
  readDraft,
  sameFields,
  serializeDraft,
  sweepDrafts,
  writeDraft,
  type DraftStorage,
} from "./draft-core.ts";

class MemoryStorage implements DraftStorage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  key(index: number) {
    return Array.from(this.map.keys())[index] ?? null;
  }
  getItem(key: string) {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.map.set(key, value);
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
  keys() {
    return Array.from(this.map.keys()).sort();
  }
}

const NOW = 1_800_000_000_000;

test("storage keys are versioned and scoped by employee", () => {
  assert.equal(
    buildStorageKey("emp_0007", "leave.apply"),
    "gtf-draft:v1:emp_0007:leave.apply",
  );
  assert.equal(
    buildStorageKey("emp_0005", "employee.edit:emp_0007"),
    "gtf-draft:v1:emp_0005:employee.edit:emp_0007",
  );
  assert.equal(isValidDraftKey("employee.edit:emp_0007"), true);
  assert.equal(isValidDraftKey(""), false);
  assert.equal(isValidDraftKey("department.edit:People & Culture"), true);
  assert.equal(
    buildStorageKey("emp_0005", "department.edit:People & Culture"),
    "gtf-draft:v1:emp_0005:department.edit:People%20%26%20Culture",
  );
  assert.equal(isValidDraftKey("x".repeat(201)), false);
});

test("field policy never persists secrets, files, hidden or flagged fields", () => {
  const ok = (
    name: string,
    type = "text",
    extra: { autocomplete?: string; noDraft?: boolean } = {},
  ) => isPersistableField({ name, type, ...extra });
  assert.equal(ok("reason"), true);
  assert.equal(ok("startDate", "date"), true);
  assert.equal(ok("leaveType", "select-one"), true);
  assert.equal(ok("note", "textarea"), true);
  for (const type of ["password", "file", "hidden", "submit"])
    assert.equal(ok("note", type), false, type);
  assert.equal(ok("idempotencyKey"), false);
  assert.equal(ok("note", "text", { noDraft: true }), false);
  assert.equal(ok("note", "text", { autocomplete: "one-time-code" }), false);
  assert.equal(ok("note", "text", { autocomplete: "cc-number" }), false);
  assert.equal(ok(""), false);
  for (const name of [
    "password",
    "newPassword",
    "otp",
    "postalCode",
    "resetToken",
    "clientSecret",
    "pin",
    "cvv",
    "accountNumber",
    "account_no",
    "ifsc",
    "panNumber",
    "aadhaar",
    "bankName",
    "basicSalary",
    "ctc",
    "uan",
    "esicNumber",
  ]) {
    assert.equal(ok(name), false, name);
  }
});

test("TTL is seven days", () => {
  assert.equal(isExpired(NOW - DRAFT_TTL_MS + 1000, NOW), false);
  assert.equal(isExpired(NOW - DRAFT_TTL_MS - 1000, NOW), true);
  assert.equal(isExpired(Number.NaN, NOW), true);
  assert.equal(
    isExpired(NOW + 10 * 60_000, NOW),
    true,
    "far-future timestamps are rejected",
  );
});

test("serialize/parse round-trips and strips sensitive names", () => {
  const raw = serializeDraft(
    { reason: ["Family"], password: ["x"], idempotencyKey: ["k"] },
    NOW,
  );
  assert.deepEqual(parseDraft(raw), {
    savedAt: NOW,
    fields: { reason: ["Family"] },
  });
  assert.equal(parseDraft("not json"), null);
  assert.equal(parseDraft(JSON.stringify({ savedAt: "x", fields: {} })), null);
  assert.equal(
    parseDraft(JSON.stringify({ savedAt: NOW, fields: { a: [1] } })),
    null,
  );
  assert.deepEqual(
    parseDraft(
      JSON.stringify({
        savedAt: NOW,
        fields: { bankName: ["HDFC"], a: ["1"] },
      }),
    )?.fields,
    { a: ["1"] },
  );
});

test("content and equality helpers", () => {
  assert.equal(hasContent({ a: [""], b: [] }), false);
  assert.equal(hasContent({ a: [" x "] }), true);
  assert.equal(sameFields({ a: ["1"], b: [] }, { a: ["1"] }), true);
  assert.equal(sameFields({ a: ["1"] }, { a: ["2"] }), false);
});

test("read returns own drafts only and drops expired ones", () => {
  const storage = new MemoryStorage();
  writeDraft(storage, "emp_0007", "leave.apply", { reason: ["Trip"] }, NOW);
  assert.deepEqual(readDraft(storage, "emp_0007", "leave.apply", NOW)?.fields, {
    reason: ["Trip"],
  });
  assert.equal(
    readDraft(storage, "emp_0005", "leave.apply", NOW),
    null,
    "another employee never sees it",
  );
  assert.equal(
    readDraft(storage, "emp_0007", "leave.apply", NOW + DRAFT_TTL_MS + 1),
    null,
  );
  assert.deepEqual(storage.keys(), [], "expired draft removed on read");
});

test("sweep removes expired, malformed, old-version and foreign drafts", () => {
  const storage = new MemoryStorage();
  writeDraft(storage, "emp_0007", "fresh", { a: ["1"] }, NOW);
  writeDraft(storage, "emp_0007", "old", { a: ["1"] }, NOW - DRAFT_TTL_MS - 1);
  writeDraft(storage, "emp_0005", "foreign", { a: ["1"] }, NOW);
  storage.setItem("gtf-draft:v1:emp_0007:broken", "{");
  storage.setItem(
    "gtf-draft:v0:emp_0007:legacy",
    serializeDraft({ a: ["1"] }, NOW),
  );
  storage.setItem("gtf-theme", "dark");
  assert.equal(sweepDrafts(storage, NOW, "emp_0007"), 4);
  assert.deepEqual(storage.keys(), [
    "gtf-draft:v1:emp_0007:fresh",
    "gtf-theme",
  ]);
});

test("a different employee signing in wipes all drafts; sign-out clears everything", () => {
  const storage = new MemoryStorage();
  claimDraftOwner(storage, "emp_0007", NOW);
  writeDraft(storage, "emp_0007", "leave.apply", { reason: ["Trip"] }, NOW);
  claimDraftOwner(storage, "emp_0007", NOW);
  assert.equal(
    readDraft(storage, "emp_0007", "leave.apply", NOW)?.fields.reason?.[0],
    "Trip",
    "same owner keeps drafts",
  );
  claimDraftOwner(storage, "emp_0005", NOW);
  assert.equal(readDraft(storage, "emp_0007", "leave.apply", NOW), null);
  assert.equal(storage.getItem(DRAFT_OWNER_KEY), "emp_0005");
  writeDraft(storage, "emp_0005", "x", { a: ["1"] }, NOW);
  storage.setItem("gtf-theme", "dark");
  clearAllDrafts(storage);
  assert.deepEqual(storage.keys(), ["gtf-theme"]);
});
