import "server-only";
import { cookies, headers } from "next/headers";
import { z } from "zod";
import { liveRequest } from "@/lib/api/core/transport";
import { apiConfig } from "@/lib/api/core/config";
const credentialSchema = z.object({ accessToken: z.string().min(20), expiresIn: z.number().int().positive() });
export async function storeAccessToken(accessToken: string, expiresIn: number) {
  const requestHeaders = await headers();
  const secure = process.env.NODE_ENV === "production" || requestHeaders.get("x-forwarded-proto") === "https";
  (await cookies()).set(apiConfig.sessionCookie, accessToken, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: expiresIn });
}
export async function signInWithCredentials(email: string, password: string) {
  const result = credentialSchema.parse(await liveRequest({ method: "POST", path: "/auth/login", body: { email, password } }));
  await storeAccessToken(result.accessToken, result.expiresIn);
}
