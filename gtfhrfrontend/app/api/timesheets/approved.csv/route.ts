import { ApiProblem } from "@/lib/api/core/problem";
import { exportApprovedTimesheets } from "@/lib/api/timesheets/timesheets.service";

/** Approved hours as CSV. Rechecks permission and scope at download time; private, never cached. */
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const { csv, fileName } = await exportApprovedTimesheets(params.get("from") ?? "", params.get("to") ?? "");
    return new Response(`﻿${csv}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    const status = error instanceof ApiProblem ? error.status : 500;
    const message = error instanceof ApiProblem && status < 500 ? error.message : "Export failed.";
    return new Response(status === 401 || status === 403 ? "You don’t have access to this export." : message, { status, headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" } });
  }
}
