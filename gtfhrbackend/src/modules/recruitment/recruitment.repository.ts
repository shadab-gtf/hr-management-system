import type { PrismaClient } from "@prisma/client";
import { talentUnitOfWork } from "../talent/talent.repository.js";
export const recruitmentRepository = (prisma: PrismaClient) => talentUnitOfWork(prisma, "recruitment");
