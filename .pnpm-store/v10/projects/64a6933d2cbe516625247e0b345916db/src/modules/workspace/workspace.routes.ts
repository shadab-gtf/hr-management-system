import type { PrismaClient } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../core/middleware/auth.middleware.js";
import { validate } from "../../core/middleware/validation.middleware.js";
import { ValidationError } from "../../core/errors/index.js";
import { announcementInputSchema } from "../../contracts/admin.js";
import {
  celebrationSettingsInputSchema,
  departmentInputSchema,
  employeeJobInputSchema,
  eventInputSchema,
  locationInputSchema,
  probationDefaultsInputSchema,
} from "../../contracts/hr-config.js";
import { ticketInputSchema } from "../../contracts/workplace.js";
import { indianMobileSchema, otpSchema } from "../../contracts/notifications.js";
import { createNotificationService } from "../notifications/notification.service.js";
import { channelsInput, preferencesInput } from "../notifications/notification.schema.js";
import { createWorkspaceService } from "./workspace.service.js";
import { workspaceController, workspaceFileController } from "./workspace.controller.js";
import {
  emptyBody,
  fileContentSchema,
  fileUploadSchema,
  idParams,
  querySchema,
  textReplySchema,
} from "./workspace.schema.js";
import { profileRequestSchema } from "./workspace.schema.js";
import { createWorkspaceHubService } from "./workspace-hub.service.js";

export function routeParam(params: Record<string, string>, key: string): string {
  const value = params[key];
  if (!value) throw new ValidationError("INVALID_PATH", "A resource identifier is required.");
  return value;
}
export function workspaceRoute<S extends z.ZodType>(
  router: Router,
  method: "get" | "post" | "patch" | "put" | "delete",
  path: string,
  schema: S,
  run: Parameters<typeof workspaceController<S>>[1],
) {
  router[method](
    path,
    authenticate,
    validate("params", idParams, { message: "Invalid path." }),
    validate("query", querySchema, { message: "Invalid query." }),
    validate("body", schema, { message: "Check the submitted fields.", fieldErrors: true }),
    workspaceController(schema, run),
  );
}
export function workspaceRoutes(prisma: PrismaClient): Router {
  const router = Router();
  const service = createWorkspaceService(prisma);
  const notifications = createNotificationService(prisma);
  const hub = createWorkspaceHubService(prisma);
  const files = workspaceFileController(service);
  router.get(
    "/employees/:id/photo",
    authenticate,
    validate("params", idParams, { message: "Invalid employee." }),
    files.photo,
  );
  router.get(
    "/documents/:id/content",
    authenticate,
    validate("params", idParams, { message: "Invalid document." }),
    files.document,
  );
  const add = <S extends z.ZodType>(
    method: "get" | "post" | "patch" | "put" | "delete",
    path: string,
    schema: S,
    run: Parameters<typeof workspaceController<S>>[1],
  ) => {
    workspaceRoute(router, method, path, schema, run);
  };
  add("get", "/me", emptyBody, (a) => service.session(a));
  add("get", "/me/home", emptyBody, (a) => hub.home(a));
  add("post", "/me/profile/change-requests", profileRequestSchema, (a, b, _p, _q, c) => hub.profileRequest(a, b, c));
  add("get", "/service-requests", emptyBody, (a, _b, _p, q) => hub.requests(a, q.view));
  add(
    "post",
    "/service-requests/:kind/:id/decisions",
    z.object({ decision: z.enum(["approve", "reject", "start"]), reason: z.string().trim().max(300).default("") }),
    (a, b, p, _q, c) => hub.decide(a, routeParam(p, "id"), routeParam(p, "kind"), b.decision, b.reason, c),
  );
  add("get", "/employees/:id", emptyBody, (a, _b, p) => service.employee(a, routeParam(p, "id")));
  add(
    "post",
    "/employees/:id/assignments",
    employeeJobInputSchema.omit({ employeeId: true, expectedVersion: true }),
    (a, b, p, _q, c) => {
      if (c.version === undefined)
        throw new ValidationError("VERSION_REQUIRED", "Send the current employee version in If-Match.");
      return service.assignment(
        a,
        routeParam(p, "id"),
        { ...b, employeeId: routeParam(p, "id"), expectedVersion: c.version },
        c,
      );
    },
  );
  add("get", "/org/chart", emptyBody, () => service.orgChart());
  add("get", "/directory/:id", emptyBody, (a, _b, p) => service.directory(a, routeParam(p, "id")));
  add("get", "/me/starred", emptyBody, (a) => service.stars(a));
  add("post", "/me/starred/:id/toggle", emptyBody, (a, _b, p, _q, c) => service.star(a, routeParam(p, "id"), c));
  add("get", "/config/organization", emptyBody, (a) => service.organization(a));
  add("post", "/config/departments", departmentInputSchema, (a, b, _p, _q, c) =>
    service.department(a, b, undefined, c),
  );
  add("patch", "/config/departments/:name", departmentInputSchema, (a, b, p, _q, c) =>
    service.department(a, b, routeParam(p, "name"), c),
  );
  add("post", "/config/locations", locationInputSchema, (a, b, _p, _q, c) => service.location(a, b.name, c));
  for (const [path, kind] of [
    ["departments", "department"],
    ["locations", "location"],
  ] as const)
    add("post", `/config/${path}/:name/delete`, emptyBody, (a, _b, p, _q, c) =>
      service.removeOrganizationItem(a, kind, routeParam(p, "name"), c),
    );
  add("patch", "/config/probation", probationDefaultsInputSchema, (a, b, _p, _q, c) =>
    service.setting(a, "probation_defaults", b, c),
  );
  add("get", "/config/celebrations", emptyBody, () => service.celebrations());
  add("patch", "/config/celebrations", celebrationSettingsInputSchema, (a, b, _p, _q, c) =>
    service.setting(a, "celebrations", { ...b, showBirthdays: false }, c),
  );
  add("get", "/events", emptyBody, (a) => service.events(a));
  add("post", "/events", eventInputSchema, (a, b, _p, _q, c) => service.event(a, b, undefined, c));
  add("patch", "/events/:id", eventInputSchema, (a, b, p, _q, c) => service.event(a, b, routeParam(p, "id"), c));
  add("post", "/events/:id/delete", emptyBody, (a, _b, p, _q, c) =>
    service.archive(a, routeParam(p, "id"), "event", c),
  );
  add("get", "/announcements", emptyBody, (a, _b, _p, q) => service.announcements(a, q.view));
  add("post", "/announcements", announcementInputSchema, (a, b, _p, _q, c) => service.announcement(a, b, undefined, c));
  add("patch", "/announcements/:id", announcementInputSchema, (a, b, p, _q, c) =>
    service.announcement(a, b, routeParam(p, "id"), c),
  );
  add("post", "/announcements/:id/archive", emptyBody, (a, _b, p, _q, c) =>
    service.archive(a, routeParam(p, "id"), "announcement", c),
  );
  add("get", "/tickets/categories", emptyBody, () => service.ticketCategories());
  add("get", "/tickets", emptyBody, (a, _b, _p, q) => service.tickets(a, q.scope));
  add("get", "/tickets/:id", emptyBody, (a, _b, p) => service.ticket(a, routeParam(p, "id")));
  add("post", "/tickets", ticketInputSchema, (a, b, _p, _q, c) => service.createTicket(a, b, c));
  add("post", "/tickets/:id/messages", textReplySchema, (a, b, p, _q, c) =>
    service.ticketCommand(a, routeParam(p, "id"), b.body, c),
  );
  add("post", "/tickets/:id/close", emptyBody, (a, _b, p, _q, c) =>
    service.ticketCommand(a, routeParam(p, "id"), null, c),
  );
  add("get", "/documents", emptyBody, (a) => service.documents(a));
  add("post", "/documents/uploads", fileUploadSchema, (a, b, _p, _q, c) => service.upload(a, b, c));
  add("put", "/documents/uploads/:id/content", fileContentSchema, (a, b, p, _q, c) =>
    service.fileContent(a, routeParam(p, "id"), Buffer.from(b.contentBase64, "base64"), b.mime, c),
  );
  add("put", "/me/photo", fileContentSchema, (a, b, _p, _q, c) =>
    service.photoUpdate(a, { bytes: Buffer.from(b.contentBase64, "base64"), mime: b.mime }, c),
  );
  add("delete", "/me/photo", emptyBody, (a, _b, _p, _q, c) => service.photoUpdate(a, null, c));
  add("get", "/me/notifications", emptyBody, (a) => notifications.list(a));
  add("get", "/me/notifications/unread-count", emptyBody, (a) => notifications.unread(a));
  add("post", "/me/notifications/read-all", emptyBody, (a, _b, _p, _q, c) => notifications.read(a, undefined, c));
  add("post", "/me/notifications/:id/read", emptyBody, (a, _b, p, _q, c) =>
    notifications.read(a, routeParam(p, "id"), c),
  );
  add("get", "/me/notification-preferences", emptyBody, (a) => notifications.preferences(a));
  add("get", "/me/notification-preferences/channels", emptyBody, (a) => notifications.channels(a));
  add("patch", "/me/notification-preferences", preferencesInput, (a, b, _p, _q, c) => notifications.save(a, b, c));
  add("patch", "/me/notification-preferences/channels", channelsInput, (a, b, _p, _q, c) =>
    notifications.save(a, b, c),
  );
  add("post", "/me/phone/verification", z.object({ number: indianMobileSchema }), (a, b, _p, _q, c) =>
    notifications.requestPhone(a, b.number, c),
  );
  add("post", "/me/phone/verification/confirm", z.object({ code: otpSchema }), (a, b, _p, _q, c) =>
    notifications.confirmPhone(a, b.code, c),
  );
  add("post", "/me/phone/delete", emptyBody, (a, _b, _p, _q, c) => notifications.deletePhone(a, c));
  return router;
}
