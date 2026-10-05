import type { PrismaClient } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../core/middleware/auth.middleware.js";
import { requirePermission } from "../core/middleware/permission.middleware.js";
import { validate } from "../core/middleware/validation.middleware.js";
import type { Capability } from "../core/security/capabilities.js";
import { permissionInputSchema, delegationInputSchema } from "../contracts/requests.js";
import { compOffClaimInputSchema, encashInputSchema, balanceAdjustmentInputSchema } from "../contracts/leave.js";
import { rosterPatternInputSchema, weeklyOffInputSchema, shiftSwapInputSchema } from "../contracts/attendance.js";
import {
  holidayInputSchema,
  leaveTypeInputSchema,
  shiftInputSchema,
  officeSiteInputSchema,
  overtimeInputSchema,
  lateEarlyInputSchema,
} from "../contracts/hr-config.js";
import { createAttendanceService, createTimeConfigService } from "./attendance/attendance.service.js";
import { createLeaveService, leaveBody } from "./leave/leave.service.js";
import { createRequestsService } from "./requests/requests.service.js";
import { createTimesheetsService } from "./timesheets/timesheets.service.js";
import { createAttendanceImportService } from "./attendance-import/attendance-import.service.js";
import { timeController } from "./time/time.controller.js";
import type { CommandContext } from "./time/time.repository.js";
import {
  approvalQuery,
  captureBody,
  date,
  decisionBody,
  empty,
  expenseBody,
  idParams,
  importBody,
  importUploadBody,
  locationBody,
  monthQuery,
  projectBody,
  regularizationBody,
  sheetBody,
  leaveEligibilityBody,
} from "./time/time.schema.js";

/** All time/workflow routes are mounted beneath /api/v1. Every external field is validated before service access. */
export function timeRoutes(prisma: PrismaClient): Router {
  const router = Router();
  const attendance = createAttendanceService(prisma),
    config = createTimeConfigService(prisma),
    leave = createLeaveService(prisma),
    requests = createRequestsService(prisma),
    sheets = createTimesheetsService(prisma),
    imports = createAttendanceImportService(prisma);
  function add<B extends z.ZodType, P extends z.ZodType, Q extends z.ZodType>(
    method: "get" | "post" | "patch",
    path: string,
    capability: Capability | null,
    body: B,
    params: P,
    query: Q,
    service: (ctx: CommandContext, body: z.output<B>, params: z.output<P>, query: z.output<Q>) => Promise<unknown>,
    list = false,
  ) {
    router[method](
      path,
      authenticate,
      ...(capability ? [requirePermission(capability)] : []),
      validate("body", body, { message: "Check the submitted fields.", fieldErrors: true }),
      validate("params", params, { message: "Check the resource identifier." }),
      validate("query", query, { message: "Check the query filters." }),
      timeController({ body, params, query }, service, list),
    );
  }
  const weekParams = z.object({ weekStart: date }),
    departmentParams = z.object({ department: z.string().min(1).max(60) }),
    rosterParams = departmentParams.extend({ weekStart: date });
  add("get", "/attendance/today", "attendance.read.self", empty, empty, empty, (ctx) => attendance.today(ctx));
  add("get", "/attendance/days", "attendance.read.self", empty, empty, monthQuery, (ctx, _b, _p, q) =>
    attendance.month(ctx, q.month),
  );
  add("get", "/attendance/team/today", "attendance.read.team", empty, empty, empty, (ctx) => attendance.team(ctx));
  add("post", "/attendance/events", "attendance.capture.self", captureBody, empty, empty, (ctx, b) =>
    attendance.capture(ctx, b),
  );
  add("post", "/attendance/location-check", "attendance.capture.self", locationBody, empty, empty, (ctx, b) =>
    attendance.location(ctx, b),
  );
  add(
    "post",
    "/attendance/regularizations",
    "attendance.regularize.request",
    regularizationBody,
    empty,
    empty,
    (ctx, b) => attendance.regularize(ctx, b),
  );
  add(
    "post",
    "/attendance/permissions",
    "attendance.regularize.request",
    permissionInputSchema,
    empty,
    empty,
    (ctx, b) => requests.permission(ctx, b),
  );
  add(
    "get",
    "/attendance/roster/me",
    "attendance.read.self",
    empty,
    empty,
    z.object({ view: z.enum(["week", "month"]).default("week"), anchor: date }),
    (ctx, _b, _p, q) => attendance.roster(ctx, q.view, q.anchor),
  );
  add(
    "get",
    "/attendance/roster/planner",
    "roster.manage",
    empty,
    empty,
    z.object({ department: z.string().optional(), weekStart: date.optional() }),
    (ctx, _b, _p, q) => attendance.planner(ctx, q.department, q.weekStart),
  );
  add(
    "patch",
    "/attendance/roster/:department/:weekStart",
    "roster.manage",
    z.object({
      intent: z.enum(["save", "publish"]),
      cells: z.record(z.string(), z.array(z.string().nullable()).length(7)),
    }),
    rosterParams,
    empty,
    (ctx, b, p) => attendance.saveRoster(ctx, p.department, p.weekStart, b.intent, b.cells),
  );
  add(
    "post",
    "/attendance/roster/:department/:weekStart/pattern",
    "roster.manage",
    rosterPatternInputSchema,
    rosterParams,
    empty,
    (ctx, b, p) => attendance.pattern(ctx, { ...b, ...p }),
  );
  add(
    "patch",
    "/config/weekly-offs/:department",
    "policy.publish",
    weeklyOffInputSchema,
    departmentParams,
    empty,
    (ctx, b, p) => attendance.saveWeeklyOff(ctx, { ...b, ...p }),
  );
  add("post", "/attendance/roster/swaps", "attendance.read.self", shiftSwapInputSchema, empty, empty, (ctx, b) =>
    attendance.swap(ctx, b),
  );
  add("post", "/attendance/roster/swaps/:id/decision", "roster.manage", decisionBody, idParams, empty, (ctx, b, p) =>
    attendance.decideSwap(ctx, p.id, b.decision, b.note),
  );
  add("post", "/attendance/roster/swaps/:id/cancel", "attendance.read.self", empty, idParams, empty, (ctx, _b, p) =>
    attendance.cancelSwap(ctx, p.id),
  );

  add("get", "/leave/overview", "leave.request.self", empty, empty, empty, (ctx) => leave.overview(ctx));
  add("get", "/employees/:id/leave-eligibility", "employee.update", empty, idParams, empty, (ctx, _b, p) =>
    leave.eligibility(ctx, p.id),
  );
  add(
    "patch",
    "/employees/:id/leave-eligibility",
    "employee.update",
    leaveEligibilityBody,
    idParams,
    empty,
    (ctx, b, p) => leave.saveEligibility(ctx, p.id, b),
  );
  add("post", "/leave/requests", "leave.request.self", leaveBody, empty, empty, (ctx, b) => leave.submit(ctx, b));
  add("post", "/leave/requests/:id/cancel", "leave.cancel.self", empty, idParams, empty, (ctx, _b, p) =>
    leave.cancel(ctx, p.id),
  );
  add("get", "/leave/calendar", "leave.request.self", empty, empty, monthQuery, (ctx, _b, _p, q) =>
    leave.calendar(ctx, q.month),
  );
  add("get", "/calendar/holidays", null, empty, empty, empty, (ctx) => leave.holidays(ctx));
  add(
    "get",
    "/leave/ledger",
    "leave.request.self",
    empty,
    empty,
    z.object({
      year: z
        .string()
        .regex(/^\d{4}$/)
        .optional(),
    }),
    (ctx, _b, _p, q) => leave.ledger(ctx, undefined, q.year),
  );
  add(
    "get",
    "/leave/ledger/:id",
    "employee.update",
    empty,
    idParams,
    z.object({
      year: z
        .string()
        .regex(/^\d{4}$/)
        .optional(),
    }),
    (ctx, _b, p, q) => leave.ledger(ctx, p.id, q.year),
  );
  add("get", "/leave/admin/people", "employee.update", empty, empty, empty, () => leave.people());
  add("post", "/leave/admin/adjustments", "employee.update", balanceAdjustmentInputSchema, empty, empty, (ctx, b) =>
    leave.adjust(ctx, b),
  );
  add("get", "/leave/comp-off", "leave.request.self", empty, empty, empty, (ctx) => leave.compOff(ctx));
  add("post", "/leave/comp-off/claims", "leave.request.self", compOffClaimInputSchema, empty, empty, (ctx, b) =>
    leave.claim(ctx, b),
  );
  add("post", "/leave/comp-off/claims/:id/decision", "approval.decide", decisionBody, idParams, empty, (ctx, b, p) =>
    leave.decision(ctx, p.id, "comp_off", b.decision, b.note),
  );
  add("post", "/leave/comp-off/claims/:id/cancel", "leave.cancel.self", empty, idParams, empty, (ctx, _b, p) =>
    leave.cancelOther(ctx, p.id, "comp_off"),
  );
  add("post", "/leave/encashments", "leave.request.self", encashInputSchema, empty, empty, (ctx, b) =>
    leave.encash(ctx, b),
  );
  add("post", "/leave/encashments/:id/decision", "employee.update", decisionBody, idParams, empty, (ctx, b, p) =>
    leave.decision(ctx, p.id, "encashment", b.decision, b.note),
  );
  add("post", "/leave/encashments/:id/cancel", "leave.cancel.self", empty, idParams, empty, (ctx, _b, p) =>
    leave.cancelOther(ctx, p.id, "encashment"),
  );
  add("get", "/leave/admin/year-end", "employee.update", empty, empty, empty, () => leave.yearEnd());
  add(
    "post",
    "/leave/admin/year-end/:year/commit",
    "employee.update",
    empty,
    z.object({ year: z.string().regex(/^\d{4}$/) }),
    empty,
    (ctx, _b, p) => leave.commitYear(ctx, p.year),
  );
  add("get", "/me/home/who-is-out", null, empty, empty, empty, (ctx) => leave.whoIsOut(ctx));

  add("get", "/expenses", "expense.submit.self", empty, empty, empty, (ctx) => requests.expenses(ctx));
  add("post", "/expenses", "expense.submit.self", expenseBody, empty, empty, (ctx, b) => requests.expense(ctx, b));
  add("get", "/me/requests", null, empty, empty, empty, (ctx) => requests.tracked(ctx), true);
  add("get", "/me/delegations", "delegation.manage", empty, empty, empty, (ctx) => requests.delegations(ctx));
  add("post", "/me/delegations", "delegation.manage", delegationInputSchema, empty, empty, (ctx, b) =>
    requests.delegate(ctx, b),
  );
  add("post", "/me/delegations/:id/revoke", "delegation.manage", empty, idParams, empty, (ctx, _b, p) =>
    requests.revoke(ctx, p.id),
  );
  add("get", "/approvals", "approval.decide", empty, empty, approvalQuery, (ctx, _b, _p, q) =>
    requests.approvals(ctx, q.state),
  );
  add("post", "/approvals/:id/decisions", "approval.decide", decisionBody, idParams, empty, (ctx, b, p) =>
    requests.decide(ctx, p.id, b.decision, b.reason ?? b.note),
  );
  add("get", "/me/work-queue", null, empty, empty, empty, (ctx) => requests.workQueue(ctx));

  add(
    "get",
    "/timesheets/weeks/me",
    "timesheet.submit.self",
    empty,
    empty,
    z.object({ week: date.optional() }),
    (ctx, _b, _p, q) => sheets.mine(ctx, q.week),
  );
  add("post", "/timesheets/weeks/me/:weekStart", "timesheet.submit.self", sheetBody, weekParams, empty, (ctx, b, p) =>
    sheets.save(ctx, p.weekStart, b),
  );
  add(
    "post",
    "/timesheets/weeks/me/:weekStart/copy-previous",
    "timesheet.submit.self",
    empty,
    weekParams,
    empty,
    (ctx, _b, p) => sheets.copy(ctx, p.weekStart),
  );
  add("get", "/timesheets/team", "timesheet.approve", empty, empty, empty, (ctx) => sheets.team(ctx));
  add("post", "/timesheets/weeks/:id/decision", "timesheet.approve", decisionBody, idParams, empty, (ctx, b, p) =>
    sheets.decision(ctx, p.id, b.decision, b.comment ?? b.note),
  );
  add(
    "post",
    "/timesheets/reminders",
    "timesheet.approve",
    z.object({ employeeId: z.string().min(1), weekStart: date }),
    empty,
    empty,
    (ctx, b) => sheets.remind(ctx, b.employeeId, b.weekStart),
  );
  add("get", "/projects", "project.manage", empty, empty, empty, (ctx) => sheets.listProjects(ctx));
  add("post", "/projects", "project.manage", projectBody, empty, empty, (ctx, b) => sheets.saveProject(ctx, b));
  add("patch", "/projects/:id", "project.manage", projectBody, idParams, empty, (ctx, b, p) =>
    sheets.saveProject(ctx, b, p.id),
  );

  add("get", "/imports/attendance", "import.commit", empty, empty, empty, () => imports.list(), true);
  add("post", "/imports/attendance/upload", "import.commit", importUploadBody, empty, empty, (ctx, b) =>
    imports.upload(ctx, b),
  );
  add("post", "/imports/attendance", "import.commit", importBody, empty, empty, (ctx, b) => imports.preview(ctx, b));
  add("get", "/imports/attendance/:id", "import.commit", empty, idParams, empty, (_ctx, _b, p) => imports.get(p.id));
  add("post", "/imports/attendance/:id/commit", "import.commit", empty, idParams, empty, (ctx, _b, p) =>
    imports.commit(ctx, p.id),
  );
  add("post", "/imports/attendance/:id/discard", "import.commit", empty, idParams, empty, (ctx, _b, p) =>
    imports.discard(ctx, p.id),
  );

  add("get", "/config/holidays", "policy.publish", empty, empty, empty, () => config.holidays(), true);
  add("post", "/config/holidays", "policy.publish", holidayInputSchema, empty, empty, (ctx, b) =>
    config.saveHoliday(ctx, b),
  );
  add("patch", "/config/holidays/:id", "policy.publish", holidayInputSchema, idParams, empty, (ctx, b, p) =>
    config.saveHoliday(ctx, b, p.id),
  );
  add("post", "/config/holidays/:id/delete", "policy.publish", empty, idParams, empty, (ctx, _b, p) =>
    config.deleteHoliday(ctx, p.id),
  );
  add("get", "/config/leave-types/version", null, empty, empty, empty, () => config.version());
  add("get", "/config/leave-types", "policy.publish", empty, empty, empty, () => config.types(), true);
  add("post", "/config/leave-types", "policy.publish", leaveTypeInputSchema, empty, empty, (ctx, b) =>
    config.saveType(ctx, b),
  );
  add("patch", "/config/leave-types/:id", "policy.publish", leaveTypeInputSchema, idParams, empty, (ctx, b, p) =>
    config.saveType(ctx, b, p.id),
  );
  add("get", "/config/attendance", "policy.publish", empty, empty, empty, () => config.rules());
  add("post", "/config/shifts", "policy.publish", shiftInputSchema, empty, empty, (ctx, b) => config.saveShift(ctx, b));
  add("patch", "/config/shifts/:id", "policy.publish", shiftInputSchema, idParams, empty, (ctx, b, p) =>
    config.saveShift(ctx, b, p.id),
  );
  add("post", "/config/shifts/:id/delete", "policy.publish", empty, idParams, empty, (ctx, _b, p) =>
    config.shiftAction(ctx, p.id, "delete"),
  );
  add("post", "/config/shifts/:id/default", "policy.publish", empty, idParams, empty, (ctx, _b, p) =>
    config.shiftAction(ctx, p.id, "default"),
  );
  add(
    "patch",
    "/config/departments/:department/shift",
    "policy.publish",
    z.object({ shiftId: z.string().min(1) }),
    departmentParams,
    empty,
    (ctx, b, p) => config.departmentShift(ctx, p.department, b.shiftId),
  );
  add("patch", "/config/attendance/overtime", "policy.publish", overtimeInputSchema, empty, empty, (ctx, b) =>
    config.overtime(ctx, b),
  );
  add("patch", "/config/attendance/late-early", "policy.publish", lateEarlyInputSchema, empty, empty, (ctx, b) =>
    config.lateEarly(ctx, b),
  );
  add(
    "get",
    "/config/sites/address-search",
    "policy.publish",
    empty,
    empty,
    z.object({ q: z.string().trim().min(3).max(200) }),
    (_ctx, _b, _p, q) => config.address(q.q),
  );
  add("post", "/config/sites", "policy.publish", officeSiteInputSchema, empty, empty, (ctx, b) => config.site(ctx, b));
  add("patch", "/config/sites/:id", "policy.publish", officeSiteInputSchema, idParams, empty, (ctx, b, p) =>
    config.site(ctx, b, p.id),
  );
  add("post", "/config/sites/:id/delete", "policy.publish", empty, idParams, empty, (ctx, _b, p) =>
    config.deleteSite(ctx, p.id),
  );
  add(
    "post",
    "/timesheets/exports/approved",
    "project.manage",
    z.object({ from: date, to: date }),
    empty,
    empty,
    (ctx, b) => sheets.exportApproved(ctx, b.from, b.to),
  );
  return router;
}
