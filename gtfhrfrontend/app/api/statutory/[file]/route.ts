import { ApiProblem } from "@/lib/api/core/problem";
import { exportStatutoryFile } from "@/lib/api/payroll/statutory.service";
import { isValidMonth } from "@/lib/utils/date";

const files = ["ecr.txt", "esi.csv", "pt.csv", "lwf.csv", "24q.csv"] as const;
type FileName = (typeof files)[number];

/** Statutory return files. Permission is rechecked at download time; never cached. */
export async function GET(request: Request, { params }: { params: Promise<{ file: string }> }) {
  try {
    const { file } = await params;
    const url = new URL(request.url);
    const month = url.searchParams.get("month") ?? "";
    if (!(files as readonly string[]).includes(file) || !isValidMonth(month))
      return new Response("Unknown file or month.", { status: 404, headers: { "Cache-Control": "no-store" } });
    const { body, fileName, contentType } = await exportStatutoryFile(file as FileName, month, url.searchParams.get("entity") ?? undefined);
    return new Response(contentType.startsWith("text/csv") ? `﻿${body}` : body, {
      headers: {
        "Content-Type": contentType,
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
