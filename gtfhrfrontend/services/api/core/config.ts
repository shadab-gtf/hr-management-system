import "server-only";

/** Synthetic fixtures are opt-in; normal application requests use the backend API. */
export type ApiMode = "mock" | "live";

const configuredMode = process.env.GTF_API_MODE;
const mode: ApiMode =
  configuredMode === "mock" ? "mock" : "live";
const configuredBaseUrl = process.env.GTF_API_BASE_URL?.trim().replace(/\/$/, "");

if (process.env.VERCEL_ENV === "production") {
  if (mode !== "live")
    throw new Error("Production Vercel deployments must use GTF_API_MODE=live.");
  if (!configuredBaseUrl)
    throw new Error("Production Vercel deployments require GTF_API_BASE_URL.");

  let protocol: string;
  try {
    protocol = new URL(configuredBaseUrl).protocol;
  } catch {
    throw new Error("GTF_API_BASE_URL must be a valid HTTPS URL in production.");
  }
  if (protocol !== "https:")
    throw new Error("GTF_API_BASE_URL must use HTTPS in production.");
}

/**
 * The only switch between the real database/API and the synthetic backend.
 * Pages, sections and components never know which one served them.
 *
 *   GTF_API_MODE=live GTF_API_BASE_URL=https://hr-api.internal pnpm build
 *   GTF_API_MODE=mock pnpm dev (explicit demo/test mode only)
 */
export const apiConfig = {
  mode,
  baseUrl: configuredBaseUrl ?? "http://127.0.0.1:4000",
  sessionCookie: process.env.GTF_SESSION_COOKIE ?? "gtf-session",
  timeoutMs: Number(process.env.GTF_API_TIMEOUT_MS ?? 10_000),
  mockLatencyMs: Number(process.env.GTF_MOCK_LATENCY_MS ?? 0),
} as const;

export const isMockMode = apiConfig.mode === "live";
/** Only explicit demo mode serves synthetic data inside the frontend process. */
export const servesLocally = apiConfig.mode === "live" && apiConfig.baseUrl === "http://127.0.0.1:4000";
