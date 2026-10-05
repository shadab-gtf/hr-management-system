import { problem } from "@/lib/api/core/problem";
import { exportCustomReport } from "@/lib/api/reports/reports.service";
import { exportError, fileResponse } from "@/lib/api/reports/download";
import { parseFormat, specFromParams, type SearchParams } from "@/lib/api/reports/spec-params";

/** Custom (builder) report download; same query string as the preview URL. */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const params: SearchParams = {};
    for (const key of new Set(url.searchParams.keys())) {
      const values = url.searchParams.getAll(key);
      params[key] = values.length > 1 ? values : values[0];
    }
    const { spec, errors } = specFromParams(params);
    if (!spec) throw problem(422, "INVALID_SPEC", Object.values(errors)[0] ?? "Choose a dataset and columns.");
    return fileResponse(await exportCustomReport(spec, parseFormat(url.searchParams.get("format"))));
  } catch (error) {
    return exportError(error);
  }
}
