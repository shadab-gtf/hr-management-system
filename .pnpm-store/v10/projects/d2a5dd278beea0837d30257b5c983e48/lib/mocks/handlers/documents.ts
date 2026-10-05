import "server-only";
import { problem } from "@/lib/api/core/problem";
import { db, nowInstant } from "@/lib/mocks/store";
import { can, idempotent, me, requireCapability, type MockActor } from "@/lib/mocks/handlers/shared";
import { issuedLetterDocuments, policyDocuments } from "@/lib/mocks/handlers/lifecycle";
import type { HrDocument } from "@/types/workplace";

export function listDocuments(actor: MockActor): HrDocument[] {
  requireCapability(actor, "document.read");
  const hr = can(actor, "employee.update");
  const stored: HrDocument[] = db()
    .documents.filter(
      (item) => item.employeeId === null || item.employeeId === actor.employeeId || (hr && item.category === "identity"),
    )
    .map(({ employeeId: _owner, ...item }) => item);
  // Issued letters and published policies are generated documents (printable views).
  return [...stored, ...issuedLetterDocuments(actor.employeeId), ...policyDocuments(actor.employeeId)].sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
}

export function registerUpload(
  actor: MockActor,
  input: { name: string; category: HrDocument["category"]; mime: HrDocument["mime"]; sizeBytes: number },
  key: string | undefined,
) {
  requireCapability(actor, "document.upload");
  return idempotent(key, () => {
    if (input.sizeBytes > 10 * 1024 * 1024)
      throw problem(413, "FILE_TOO_LARGE", "Files must be 10 MB or smaller.", { fieldErrors: { file: "Choose a file up to 10 MB." } });
    const employee = me(actor);
    const store = db();
    const id = `dc_${store.counter + 1}`;
    store.counter += 1;
    // Uploads are quarantined until a scan completes; they are never previewable before that.
    store.documents.push({
      id,
      employeeId: employee.id,
      name: input.name,
      category: input.category,
      mime: input.mime,
      sizeBytes: input.sizeBytes,
      uploadedAt: nowInstant(),
      uploadedBy: employee.name,
      scanState: "scanning",
    });
    return { documentId: id, scanState: "scanning" };
  });
}
