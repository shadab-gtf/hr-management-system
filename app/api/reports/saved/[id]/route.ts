import { exportSavedReport } from "@/lib/api/reports/reports.service";
import { exportError, fileResponse } from "@/lib/api/reports/download";
import { parseFormat } from "@/lib/api/reports/spec-params";

/** Saved report download; visibility and salary scope are rechecked. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    return fileResponse(await exportSavedReport(id, parseFormat(new URL(request.url).searchParams.get("format"))));
  } catch (error) {
    return exportError(error);
  }
}
