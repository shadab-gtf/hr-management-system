import { PrismaClient } from "@prisma/client";
import type { Request } from "express";
import { databaseConfig } from "../../config/database.js";

export function createPrismaClient(): PrismaClient {
  return new PrismaClient({ datasourceUrl: databaseConfig.url });
}

/** The app's Prisma client (set on `app.locals.prisma` by `buildApp`), for middleware that is not module-scoped. */
export function prismaOf(request: Request): PrismaClient {
  return request.app.locals.prisma as PrismaClient;
}
