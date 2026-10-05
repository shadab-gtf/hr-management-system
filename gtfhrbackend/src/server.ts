import { buildApp } from "./app.js";
import { config } from "./config/index.js";
import { createPrismaClient } from "./core/database/prisma.js";
import { logger } from "./core/logger/logger.js";
import { createDeliveryService } from "./modules/delivery/delivery.service.js";
import { createReportsService } from "./modules/reports/reports.service.js";

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

server.on("error", (error) => {
  logger.error("server failed to start", { error: error.message });
  process.exitCode = 1;
  if (timer) clearInterval(timer);
  delivery.close();
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
    server.close();
  });
