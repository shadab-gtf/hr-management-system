import { env } from "./env.js";

export { databaseConfig } from "./database.js";
export { loggerConfig } from "./logger.js";

export const config = {
  nodeEnv: env.NODE_ENV,
  host: env.HOST,
  port: env.PORT,
  corsOrigin: env.CORS_ORIGIN,
  appBaseUrl: env.APP_BASE_URL.replace(/\/$/, ""),
  storageDir: env.STORAGE_DIR,
  mail: { smtpUrl: env.SMTP_URL, from: env.MAIL_FROM },
  encryptionKey: env.ENCRYPTION_KEY,
  mfaEnforced: env.MFA_ENFORCED === "true",
  sms: { url: env.SMS_GATEWAY_URL, token: env.SMS_GATEWAY_TOKEN },
  scanner: { url: env.FILE_SCANNER_URL, token: env.FILE_SCANNER_TOKEN },
  backgroundJobsEnabled: env.BACKGROUND_JOBS_ENABLED === "true",
  jwt: {
    secret: new TextEncoder().encode(env.JWT_SECRET),
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
  },
} as const;
