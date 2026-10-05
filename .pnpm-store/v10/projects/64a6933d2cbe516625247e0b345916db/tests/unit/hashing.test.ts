import { test } from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword } from "../../src/core/security/hashing.js";

test("password verification stores a non-reversible bcrypt hash", async () => {
  const password = "river lantern meadow orbit!";
  const encoded = await hashPassword(password);
  assert.notEqual(encoded, password);
  assert.equal(await verifyPassword(password, encoded), true);
  assert.equal(await verifyPassword("different phrase entirely", encoded), false);
});

test("password creation rejects weak and excessive lengths", async () => {
  await assert.rejects(hashPassword("too short"));
  await assert.rejects(hashPassword("x".repeat(129)));
  await assert.rejects(hashPassword("password123456789!"));
  await assert.rejects(hashPassword("abababababababab"));
});
