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
  attendanceLog: {
    maxAccuracyM: env.ATTENDANCE_LOG_MAX_ACCURACY_M,
    newDevicePolicy: env.ATTENDANCE_LOG_NEW_DEVICE_POLICY,
    outsideGeofencePolicy: env.ATTENDANCE_LOG_OUTSIDE_GEOFENCE_POLICY,
    selfieRetentionDays: env.ATTENDANCE_SELFIE_RETENTION_DAYS,
  },
  realtime: {
    publicUrl: env.REALTIME_PUBLIC_URL,
    /** Browser origins allowed to open a socket: the frontend (CORS origin and public app URL). */
    allowedOrigins: [...new Set([new URL(env.CORS_ORIGIN).origin, new URL(env.APP_BASE_URL).origin])],
  },
  jwt: {
    secret: new TextEncoder().encode(env.JWT_SECRET),
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
  },
} as const;
