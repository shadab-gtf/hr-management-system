import "server-only";
import { cookies } from "next/headers";
import { z } from "zod";
import { apiConfig } from "@/lib/api/core/config";
import { problem } from "@/lib/api/core/problem";
import { callApi } from "@/lib/api/core/transport";
import { mockActor } from "@/lib/api/session/session.service";
import { getProfilePhoto, setProfilePhoto } from "@/lib/mocks/handlers/employees";

async function sessionHeaders(): Promise<Headers> {
  const headers = new Headers();
  const session = (await cookies()).get(apiConfig.sessionCookie)?.value;
  if (session) headers.set("Authorization", `Bearer ${session}`);
  return headers;
}

/** Binary read; the live API rechecks directory access on every request. */
export async function fetchProfilePhoto(employeeId: string): Promise<{ body: Uint8Array; mime: string }> {
  if (apiConfig.mode === "mock") {
    const photo = getProfilePhoto(await mockActor(), employeeId);
    return { body: photo.data, mime: photo.mime };
  }
  const response = await fetch(`${apiConfig.baseUrl}/api/v1/employees/${encodeURIComponent(employeeId)}/photo`, {
    headers: await sessionHeaders(),
    cache: "no-store",
    signal: AbortSignal.timeout(apiConfig.timeoutMs),
  });
  if (!response.ok) throw problem(response.status, "PHOTO_UNAVAILABLE", "Photo unavailable.");
  return {
    body: new Uint8Array(await response.arrayBuffer()),
    mime: response.headers.get("Content-Type") ?? "application/octet-stream",
  };
}

/** Replaces (or removes, with null) the signed-in user's own photo. */
export async function updateOwnPhoto(file: { data: Uint8Array; mime: string } | null) {
  return callApi({
    schema: z.object({ photoUrl: z.string().nullable() }),
    live: { method: file ? "PUT" : "DELETE", path: "/me/photo", ...(file ? { body: { mime: file.mime, contentBase64: Buffer.from(file.data).toString("base64") } } : {}) },
    mock: async () => setProfilePhoto(await mockActor(), file),
  });
}
