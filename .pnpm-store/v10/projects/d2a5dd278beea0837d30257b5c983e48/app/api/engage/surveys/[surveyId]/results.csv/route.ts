import { ApiProblem } from "@/lib/api/core/problem";
import { exportSurveyResults } from "@/lib/api/engage/surveys.service";

/** Aggregated results only; rechecks survey.manage at download time; never cached. */
export async function GET(_request: Request, { params }: { params: Promise<{ surveyId: string }> }) {
  try {
    const { surveyId } = await params;
    const { csv, fileName } = await exportSurveyResults(surveyId);
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
    return new Response(status === 401 || status === 403 ? "You don’t have access to this export." : message, { status, headers: { "Cache-Control": "no-store" } });
  }
}
