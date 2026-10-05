import "server-only";

export type ApiMode = "mock" | "live";

/**
 * The only switch between the synthetic backend and the real HR API.
 * Pages, sections and components never know which one served them.
 *
 *   GTF_API_MODE=live GTF_API_BASE_URL=https://hr-api.internal pnpm build
 */
export const apiConfig = {
  mode: (process.env.GTF_API_MODE === "live" ? "live" : "mock") as ApiMode,
  baseUrl: process.env.GTF_API_BASE_URL?.replace(/\/$/, "") ?? "",
  sessionCookie: process.env.GTF_SESSION_COOKIE ?? "gtf-session",
  timeoutMs: Number(process.env.GTF_API_TIMEOUT_MS ?? 10_000),
  mockLatencyMs: Number(process.env.GTF_MOCK_LATENCY_MS ?? 0),
} as const;

export const isMockMode = apiConfig.mode === "mock";
