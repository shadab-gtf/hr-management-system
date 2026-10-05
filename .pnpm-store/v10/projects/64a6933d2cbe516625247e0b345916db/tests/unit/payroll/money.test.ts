import assert from "node:assert/strict";
import { test } from "node:test";
import { emiOf, rate, roundDiv, roundedRupee } from "../../../src/modules/payroll/payroll.rules.js";
test("paise arithmetic rounds deterministically and EMI never loses principal", () => {
  assert.equal(rate(123456, 1200), 14815);
  assert.equal(roundedRupee(123450), 123500);
  assert.equal(roundDiv(10n, 3n), 3);
  assert.equal(emiOf(1000001n, 12), 83400);
  assert.ok(emiOf(1000001n, 12) * 12 >= 1000001);
});
