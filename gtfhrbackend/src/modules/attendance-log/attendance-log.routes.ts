import type { PrismaClient } from "@prisma/client";
import { Router } from "express";
import { authenticate } from "../../core/middleware/auth.middleware.js";
import { requirePermission } from "../../core/middleware/permission.middleware.js";
import { validate } from "../../core/middleware/validation.middleware.js";
import { attendanceLogController } from "./attendance-log.controller.js";
import {
  attendanceLogBody,
  attendanceLogParams,
  attendanceLogQuery,
  attendanceLogReviewQuery,
} from "./attendance-log.schema.js";
import { createAttendanceLogService } from "./attendance-log.service.js";

/** Selfie + live GPS attendance (docs/api/attendance-log.md), mounted beneath /api/v1. */
export function attendanceLogRoutes(prisma: PrismaClient): Router {
  const router = Router();
  const controller = attendanceLogController(createAttendanceLogService(prisma));
  router.post(
    "/attendance/log",
    authenticate,
    requirePermission("attendance.capture.self"),
    validate("body", attendanceLogBody, { message: "Check the attendance details.", fieldErrors: true }),
    controller.log,
  );
  router.get(
    "/attendance/log",
    authenticate,
    requirePermission("attendance.read.self"),
    validate("query", attendanceLogQuery, { message: "Check the query filters." }),
    controller.mine,
  );
  // Managers (own team) and HR (scoped); the service checks the caller's reach.
  router.get(
    "/attendance/log/review",
    authenticate,
    validate("query", attendanceLogReviewQuery, { message: "Check the query filters." }),
    controller.review,
  );
  router.get(
    "/attendance/log/:id/selfie",
    authenticate,
    validate("params", attendanceLogParams, { message: "Check the resource identifier." }),
    controller.selfie,
  );
  return router;
}
