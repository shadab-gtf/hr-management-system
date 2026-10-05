import { getSession, hasCapability } from "@/lib/api/session/session.service";

/** Blank daily-layout template with two illustrative rows (fictional codes). */
export async function GET() {
  const session = await getSession();
  if (!session || !hasCapability(session, "import.commit")) return new Response("You don’t have access to this.", { status: 403, headers: { "Cache-Control": "no-store" } });
  const csv = ["Employee Code,Employee Name,Date,In Time,Out Time", "GTF-1007,Sample Person,01-10-2026,09:24,18:41", "GTF-1009,Sample Person,01-10-2026,09:41,"].join("\r\n");
  return new Response(`\uFEFF${csv}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="gtf-attendance-import-template.csv"',
      "Cache-Control": "private, no-store",
    },
  });
}
