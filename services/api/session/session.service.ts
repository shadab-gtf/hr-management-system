import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { apiConfig } from "@/lib/api/core/config";
import { ApiProblem, problem } from "@/lib/api/core/problem";
import { callApi } from "@/lib/api/core/transport";
import { actorFor, type MockActor } from "@/lib/mocks/handlers/shared";
import { mockPersonaOptions, mockSession } from "@/lib/mocks/handlers/session";
import { personaSchema, sessionSchema, type Capability, type Session } from "@/types/session";

async function mockPersona() {
  const value = (await cookies()).get(apiConfig.sessionCookie)?.value;
  const parsed = personaSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** Resolves the demo actor for mock handlers; the live API derives it from the session. */
export async function mockActor(): Promise<MockActor> {
  const persona = await mockPersona();
  if (!persona) throw problem(401, "UNAUTHENTICATED", "Your session has ended. Sign in again.");
  return actorFor(persona);
}

/** Current session, or null when signed out. Deduplicated per request. */
export const getSession = cache(async (): Promise<Session | null> => {
  try {
    return await callApi({
      schema: sessionSchema,
      live: { path: "/me" },
      mock: async () => {
        const persona = await mockPersona();
        if (!persona) throw problem(401, "UNAUTHENTICATED", "Signed out.");
        return mockSession(persona);
      },
    });
  } catch (error) {
    if (error instanceof ApiProblem && error.status === 401) return null;
    throw error;
  }
});

export function hasCapability(session: Session, ...capabilities: Capability[]): boolean {
  return capabilities.some((capability) => session.capabilities.includes(capability));
}

/** Demo personas are offered only by the mock backend. */
export function getPersonaOptions() {
  return apiConfig.mode === "mock" ? mockPersonaOptions() : [];
}
