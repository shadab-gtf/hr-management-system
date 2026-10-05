import type { PrismaClient } from "@prisma/client";
import nodemailer from "nodemailer";
import { z } from "zod";
import { config } from "../../config/index.js";
import { logger } from "../../core/logger/logger.js";
import { createDeliveryRepository } from "./delivery.repository.js";
export function createDeliveryService(prisma: PrismaClient) {
  const repo = createDeliveryRepository(prisma);
  const smtpUrl = config.mail.smtpUrl ? new URL(config.mail.smtpUrl) : null;
  if (smtpUrl) {
    smtpUrl.searchParams.set("connectionTimeout", "10000");
    smtpUrl.searchParams.set("socketTimeout", "15000");
  }
  const transport = smtpUrl ? nodemailer.createTransport(smtpUrl.toString()) : null;
  return {
    async tick() {
      if (transport)
        for (let i = 0; i < 10; i++) {
          const processed = await repo.dispatchOne(async (message) => {
            await transport.sendMail({
              from: config.mail.from,
              to: message.to,
              subject: message.subject,
              text: message.textBody,
              ...(message.htmlBody ? { html: message.htmlBody } : {}),
              messageId: `<${message.id}@gtf-hr.local>`,
              disableFileAccess: true,
              disableUrlAccess: true,
            });
          });
          if (!processed) break;
        }
      if (config.scanner.url)
        for (const row of await repo.scanning()) {
          const file = await repo.file(row.id);
          if (!file) continue;
          try {
            const response = await fetch(config.scanner.url, {
              method: "POST",
              headers: {
                "Content-Type": "application/octet-stream",
                "X-File-Sha256": file.sha256,
                ...(config.scanner.token ? { Authorization: `Bearer ${config.scanner.token}` } : {}),
              },
              body: Buffer.from(file.bytes),
              signal: AbortSignal.timeout(15000),
            });
            if (!response.ok) continue;
            const result = z.object({ clean: z.boolean() }).parse(await response.json());
            await repo.completeScan(row.id, row.version, result.clean);
          } catch {
            logger.warn("file scanner unavailable", { code: "SCANNER_UNAVAILABLE" });
          }
        }
    },
    close() {
      transport?.close();
    },
  };
}
