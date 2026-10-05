import type { PrismaClient } from "@prisma/client";
import { talentUnitOfWork } from "../talent/talent.repository.js";
export const performanceRepository = (prisma: PrismaClient) => talentUnitOfWork(prisma, "performance");
