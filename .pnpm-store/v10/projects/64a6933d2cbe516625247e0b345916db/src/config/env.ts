import "dotenv/config";
import { z } from "zod";

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    HOST: z.string().default("127.0.0.1"),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    CORS_ORIGIN: z.url().default("http://localhost:3000"),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).optional(),
    DATABASE_URL: z.url(),
    JWT_SECRET: z.string().min(32),
    JWT_ISSUER: z.url(),
    JWT_AUDIENCE: z.string().min(1),
    /** Public URL of the frontend; used for links in emails (set-password, approvals). */
    APP_BASE_URL: z.url().default("http://127.0.0.1:3000"),
    /** Local directory for uploaded files (gitignored). */
    STORAGE_DIR: z.string().min(1).default("./storage"),
    /** smtp(s)://user:pass@host:port; absent means mail remains queued without logging its content. */
    SMTP_URL: z.url().optional(),
    MAIL_FROM: z.string().min(3).default("GTF HR <no-reply@gtf-hr.example>"),
    ENCRYPTION_KEY: z
      .string()
      .regex(/^[a-fA-F0-9]{64}$/)
      .optional(),
    MFA_ENFORCED: z.enum(["true", "false"]).default("true"),
    SMS_GATEWAY_URL: z.url().optional(),
    SMS_GATEWAY_TOKEN: z.string().min(16).optional(),
    FILE_SCANNER_URL: z.url().optional(),
    FILE_SCANNER_TOKEN: z.string().min(16).optional(),
    BACKGROUND_JOBS_ENABLED: z.enum(["true", "false"]).default("true"),
    /** Selfie + GPS attendance (docs/api/attendance-log.md): worst accepted GPS accuracy radius in metres. */
    ATTENDANCE_LOG_MAX_ACCURACY_M: z.coerce.number().int().min(10).max(1000).default(100),
    /** A log from a device other than the employee's first registered one: flag it (and notify HR) or reject it. */
    ATTENDANCE_LOG_NEW_DEVICE_POLICY: z.enum(["flag", "reject"]).default("flag"),
    /** A log outside every office geofence (and not remote-allowed): flag it or reject it. */
    ATTENDANCE_LOG_OUTSIDE_GEOFENCE_POLICY: z.enum(["flag", "reject"]).default("flag"),
    /** Days attendance selfies are kept before the retention job deletes the image (log rows are kept). */
    ATTENDANCE_SELFIE_RETENTION_DAYS: z.coerce.number().int().min(1).max(3650).default(90),
    /** WebSocket URL browsers use to reach the realtime hub (ws:// locally, wss:// behind TLS). */
    REALTIME_PUBLIC_URL: z.url({ protocol: /^wss?$/ }).default("ws://127.0.0.1:4000/api/v1/realtime"),
  })
  .superRefine((value, ctx) => {
    if (value.NODE_ENV === "production" && !value.ENCRYPTION_KEY)
      ctx.addIssue({
        code: "custom",
        path: ["ENCRYPTION_KEY"],
        message: "Production requires a dedicated data-encryption key.",
      });
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const invalid = parsed.error.issues.map((issue) => issue.path.join("."));
  throw new Error(`Invalid API server configuration: ${invalid.join(", ")}`);
}

/** Validated process environment. Values are never logged. */
export const env = parsed.data;
