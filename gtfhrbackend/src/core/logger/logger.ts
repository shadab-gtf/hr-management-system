import { loggerConfig } from "../../config/logger.js";

const severity = { debug: 10, info: 20, warn: 30, error: 40 } as const;
type LogLevel = keyof typeof severity;
type LogContext = Record<string, string | number | boolean | null | undefined>;

const sinks: Record<LogLevel, (line: string) => void> = {
  debug: console.debug,
  info: console.info,
  warn: console.warn,
  error: console.error,
};

/** One JSON line per event. Pass identifiers only, never tokens, passwords or HR payloads. */
function write(level: LogLevel, message: string, context: LogContext = {}): void {
  if (severity[level] < severity[loggerConfig.level]) return;
  sinks[level](
    JSON.stringify({ time: new Date().toISOString(), level, service: loggerConfig.service, message, ...context }),
  );
}

export const logger = {
  debug: (message: string, context?: LogContext): void => {
    write("debug", message, context);
  },
  info: (message: string, context?: LogContext): void => {
    write("info", message, context);
  },
  warn: (message: string, context?: LogContext): void => {
    write("warn", message, context);
  },
  error: (message: string, context?: LogContext): void => {
    write("error", message, context);
  },
};
