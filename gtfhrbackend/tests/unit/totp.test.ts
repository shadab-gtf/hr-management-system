import assert from "node:assert/strict";
import test from "node:test";
import { generateTotpSecret, totpCode, verifyTotp } from "../../src/core/security/totp.js";
test("RFC 6238 SHA-1 test vector and replay rejection", () => {
  const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
  assert.equal(totpCode(secret, 1), "287082");
  assert.equal(verifyTotp(secret, "287082", null, 59000), 1);
  assert.equal(verifyTotp(secret, "287082", 1n, 59000), null);
  assert.equal(verifyTotp(secret, "000000", null, 59000), null);
  assert.match(generateTotpSecret(), /^[A-Z2-7]{32}$/);
});
