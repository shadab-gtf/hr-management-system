import { exportSavedReport, getDeliveryExport } from "@/lib/api/reports/reports.service";
import { exportError, fileResponse } from "@/lib/api/reports/download";
import { parseFormat } from "@/lib/api/reports/spec-params";

/** Saved report download; visibility and salary scope are rechecked. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const search = new URL(request.url).searchParams;
    const delivery = search.get("delivery");
    return fileResponse(delivery ? await getDeliveryExport(delivery) : await exportSavedReport(id, parseFormat(search.get("format"))));
  } catch (error) {
    return exportError(error);
  }
}
