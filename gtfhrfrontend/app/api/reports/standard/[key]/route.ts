import { problem } from "@/lib/api/core/problem";
import { exportStandardReport } from "@/lib/api/reports/reports.service";
import { exportError, fileResponse } from "@/lib/api/reports/download";
import { filtersFromParams, parseFormat, parseStandardKey } from "@/lib/api/reports/spec-params";

/** Standard report download. Capability (and salary scope) is rechecked per request. */
export async function GET(request: Request, { params }: { params: Promise<{ key: string }> }) {
  try {
    const key = parseStandardKey((await params).key);
    if (!key.success) throw problem(404, "UNKNOWN_REPORT", "This report doesn't exist.");
    const url = new URL(request.url);
    const { filters, errors } = filtersFromParams(Object.fromEntries(url.searchParams));
    const firstError = Object.values(errors)[0];
    if (firstError) throw problem(422, "INVALID_FILTER", firstError);
    return fileResponse(await exportStandardReport(key.data, filters, parseFormat(url.searchParams.get("format"))));
  } catch (error) {
    return exportError(error);
  }
}
