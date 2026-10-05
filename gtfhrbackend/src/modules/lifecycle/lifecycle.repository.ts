import type { PrismaClient } from "@prisma/client";
import { talentUnitOfWork } from "../talent/talent.repository.js";
export const lifecycleRepository = (prisma: PrismaClient) => talentUnitOfWork(prisma, "lifecycle");
