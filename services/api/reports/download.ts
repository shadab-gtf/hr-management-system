import "server-only";
import { ApiProblem } from "@/lib/api/core/problem";
import type { ExportFile } from "@/types/reports";

/** Private, never-cached attachment. */
export function fileResponse(file: ExportFile): Response {
  return new Response(file.content, {
    headers: {
      "Content-Type": file.contentType,
      "Content-Disposition": `attachment; filename="${file.fileName}"`,
      "Cache-Control": "private, no-store",
      "X-Report-Rows": String(file.rowCount),
    },
  });
}

/** Maps a problem to a plain-text error without leaking internals. */
export function exportError(error: unknown): Response {
  const status = error instanceof ApiProblem ? error.status : 500;
  const message = error instanceof ApiProblem && status < 500 ? error.message : "Export failed.";
  if (!(error instanceof ApiProblem)) console.error("[gtf-reports] export failed", error);
  return new Response(status === 401 || status === 403 ? "You don’t have access to this export." : message, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
