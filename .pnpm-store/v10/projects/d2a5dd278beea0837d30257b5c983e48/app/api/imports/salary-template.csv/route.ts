import { getSession, hasCapability } from "@/lib/api/session/session.service";

/** Blank salary-sheet template with illustrative rows (fictional values). */
export async function GET() {
  const session = await getSession();
  if (!session || !hasCapability(session, "compensation.manage", "payroll.approve")) return new Response("You don’t have access to this.", { status: 403, headers: { "Cache-Control": "no-store" } });
  const csv = [
    "Employee Code,Employee Name,Effective Date,Annual CTC,Basic,HRA,Special Allowance,Reason",
    "GTF-1007,Sample Person,01-10-2026,1980000,990000,396000,594000,Annual review",
    "GTF-1009,Sample Person,01-10-2026,12 L,,,,Promotion",
  ].join("\r\n");
  return new Response(`\uFEFF${csv}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="gtf-salary-import-template.csv"',
      "Cache-Control": "private, no-store",
    },
  });
}
