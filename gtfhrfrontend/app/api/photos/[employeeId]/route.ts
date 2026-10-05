import { ApiProblem } from "@/lib/api/core/problem";
import { fetchProfilePhoto } from "@/lib/api/photos/photos.service";

/**
 * Serves work photos to signed-in members only. URLs carry a version, so a
 * given URL's bytes never change and can be cached privately.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ employeeId: string }> }) {
  const { employeeId } = await params;
  try {
    const photo = await fetchProfilePhoto(employeeId);
    return new Response(photo.body as BodyInit, {
      headers: {
        "Content-Type": photo.mime,
        "Cache-Control": "private, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'",
      },
    });
  } catch (error) {
    const status = error instanceof ApiProblem ? error.status : 500;
    return new Response(null, { status: status === 401 || status === 403 ? 404 : status, headers: { "Cache-Control": "no-store" } });
  }
}
