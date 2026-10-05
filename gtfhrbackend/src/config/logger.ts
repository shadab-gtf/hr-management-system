import { SERVICE_NAME } from "../utils/constants.js";
import { env } from "./env.js";

const defaultLevel = { production: "info", test: "warn", development: "debug" } as const;

export const loggerConfig = {
  service: SERVICE_NAME,
  level: env.LOG_LEVEL ?? defaultLevel[env.NODE_ENV],
} as const;
