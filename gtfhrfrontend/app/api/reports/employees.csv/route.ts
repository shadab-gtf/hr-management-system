import { ApiProblem } from "@/lib/api/core/problem";
import { exportEmployeesCsv } from "@/lib/api/admin/admin.service";
import { auditExport } from "@/lib/api/reports/reports.service";

/** Rechecks report permission at download time; never cached; audit-logged. */
export async function GET() {
  try {
    const csv = await exportEmployeesCsv();
    await auditExport("Employee directory", Math.max(0, csv.split("\r\n").length - 1), "All employees");
    return new Response(`﻿${csv}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="gtf-employees-${new Date().toISOString().slice(0, 10)}.csv"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    const status = error instanceof ApiProblem ? error.status : 500;
    return new Response(status === 403 || status === 401 ? "You don’t have access to this export." : "Export failed.", { status, headers: { "Cache-Control": "no-store" } });
  }
}
