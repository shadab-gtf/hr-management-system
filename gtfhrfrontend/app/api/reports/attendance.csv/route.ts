import { ApiProblem } from "@/lib/api/core/problem";
import { exportAttendanceMonth } from "@/lib/api/admin/admin.service";

/** Rechecks permission at download time; private, never cached. */
export async function GET(request: Request) {
  try {
    const month = new URL(request.url).searchParams.get("month") ?? "";
    const { csv, fileName } = await exportAttendanceMonth(month);
    return new Response(`\uFEFF${csv}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    const status = error instanceof ApiProblem ? error.status : 500;
    const message = error instanceof ApiProblem && status < 500 ? error.message : "Export failed.";
    return new Response(status === 401 || status === 403 ? "You don’t have access to this export." : message, { status, headers: { "Cache-Control": "no-store" } });
  }
}
