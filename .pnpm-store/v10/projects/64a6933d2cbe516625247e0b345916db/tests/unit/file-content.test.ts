import assert from "node:assert/strict";
import test from "node:test";
import { fileContentSchema } from "../../src/modules/workspace/workspace.schema.js";

test("file content accepts a valid maximum 10 MiB base64 payload without exhausting the regex stack", () => {
  const bytes = Buffer.alloc(10 * 1024 * 1024, 0x61);
  bytes.write("%PDF-1.4\n");
  const contentBase64 = bytes.toString("base64");
  const parsed = fileContentSchema.parse({ contentBase64, mime: "application/pdf" });
  assert.equal(Buffer.from(parsed.contentBase64, "base64").byteLength, bytes.byteLength);
  assert.deepEqual(Buffer.from(parsed.contentBase64, "base64"), bytes);
});

test("file content rejects malformed base64, unsupported media types and oversized encoded input", () => {
  for (const contentBase64 of ["", "AA", "AAA", "=AAA", "AA=A", "A===", "AAAA\n", "AAAA$AAA"])
    assert.equal(fileContentSchema.safeParse({ contentBase64, mime: "application/pdf" }).success, false, contentBase64);
  assert.equal(fileContentSchema.safeParse({ contentBase64: "AAAA", mime: "text/html" }).success, false);
  assert.equal(
    fileContentSchema.safeParse({ contentBase64: "A".repeat(14 * 1024 * 1024 + 4), mime: "application/pdf" }).success,
    false,
  );
});
