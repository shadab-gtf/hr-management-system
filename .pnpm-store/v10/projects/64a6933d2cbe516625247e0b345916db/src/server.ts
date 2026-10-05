import { buildApp } from "./app.js";
import { config } from "./config/index.js";
import { createPrismaClient } from "./core/database/prisma.js";
import { logger } from "./core/logger/logger.js";
import { createDeliveryService } from "./modules/delivery/delivery.service.js";
import { createReportsService } from "./modules/reports/reports.service.js";
import { attachRealtime } from "./modules/realtime/realtime.hub.js";
import { purgeExpiredSelfies } from "./modules/attendance-log/attendance-log.service.js";

const prisma = createPrismaClient();
const delivery = createDeliveryService(prisma);
const reports = createReportsService(prisma);
let runningJob: Promise<void> | undefined;
let stopping = false;
function work() {
  if (runningJob || stopping) return;
  runningJob = (async () => {
    await reports.processDue();
    await delivery.tick();
    // Hourly at most: deletes attendance selfies past ATTENDANCE_SELFIE_RETENTION_DAYS.
    await purgeExpiredSelfies(prisma);
  })()
    .catch(() => {
      logger.error("background job failed", { code: "BACKGROUND_JOB_FAILED" });
    })
    .finally(() => {
      runningJob = undefined;
    });
}
const timer = config.backgroundJobsEnabled ? setInterval(work, 30_000).unref() : undefined;
const server = buildApp(prisma).listen(config.port, config.host, () => {
  logger.info("listening", { url: `http://${config.host}:${config.port}` });
});

// WebSocket hub on the same port (HTTP upgrade at /api/v1/realtime). Independent of BACKGROUND_JOBS_ENABLED.
const realtime = attachRealtime(server, prisma);

server.on("error", (error) => {
  logger.error("server failed to start", { error: error.message });
  process.exitCode = 1;
  if (timer) clearInterval(timer);
  delivery.close();
  void realtime.close();
  void prisma.$disconnect();
});
server.on("close", () => {
  void (async () => {
    await runningJob;
    delivery.close();
    await prisma.$disconnect();
  })();
});

for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => {
    stopping = true;
    if (timer) clearInterval(timer);
    // Close sockets (and the database listener) first: open WebSockets would otherwise keep the server alive.
    void realtime.close().finally(() => server.close());
  });
