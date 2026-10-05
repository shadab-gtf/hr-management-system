import type { PrismaClient } from "@prisma/client";
import { Router } from "express";
import { createIdentityService } from "./identity.service.js";
import { identityController } from "./identity.controller.js";
import { disableInput, passwordSetupInput, recoveryInput, roleInput, totpInput } from "./identity.schema.js";
import { routeParam, workspaceRoute } from "../workspace/workspace.routes.js";
import { emptyBody, querySchema } from "../workspace/workspace.schema.js";
import { loginRateLimit } from "../../core/middleware/rate-limit.middleware.js";
import { validate } from "../../core/middleware/validation.middleware.js";

export function identityRoutes(prisma: PrismaClient): Router {
  const router = Router();
  const service = createIdentityService(prisma);
  const controller = identityController(service);
  router.post(
    "/auth/recovery",
    loginRateLimit(),
    validate("body", recoveryInput, { message: "Enter a valid email." }),
    controller.recovery,
  );
  router.post(
    "/auth/set-password",
    loginRateLimit(),
    validate("body", passwordSetupInput, { message: "Check the link and password." }),
    controller.password,
  );
  router.get(
    "/auth/link",
    loginRateLimit(),
    validate("query", querySchema, { message: "Invalid link." }),
    controller.describe,
  );
  workspaceRoute(router, "get", "/identity/access", emptyBody, (a) => service.access(a));
  workspaceRoute(router, "get", "/me/security", emptyBody, (a) => service.security(a));
  workspaceRoute(router, "get", "/me/security/mfa-gate", emptyBody, (a) => service.gate(a));
  workspaceRoute(router, "get", "/audit", emptyBody, (a, _b, _p, q) => service.audit(a, q));
  workspaceRoute(router, "post", "/identity/accounts/:id/invite", emptyBody, (a, _b, p, _q, c) =>
    service.invite(a, routeParam(p, "id"), false, c),
  );
  workspaceRoute(router, "post", "/identity/accounts/:id/invite-link", emptyBody, (a, _b, p, _q, c) =>
    service.invite(a, routeParam(p, "id"), true, c),
  );
  for (const op of ["grant", "revoke"] as const)
    workspaceRoute(router, "post", `/identity/accounts/:id/roles/${op}`, roleInput, (a, b, p, _q, c) =>
      service.role(a, routeParam(p, "id"), op, b, c),
    );
  for (const op of ["disable", "enable"] as const)
    workspaceRoute(router, "post", `/identity/accounts/:id/${op}`, disableInput, (a, b, p, _q, c) =>
      service.disable(a, routeParam(p, "id"), op === "disable", b.reason, c),
    );
  workspaceRoute(router, "post", "/me/security/mfa/enroll", emptyBody, (a, _b, _p, _q, c) => service.enroll(a, c));
  router.use("/me/security/mfa/verify", loginRateLimit());
  workspaceRoute(router, "post", "/me/security/mfa/verify", totpInput, (a, b, _p, _q, c) =>
    service.verify(a, b.code, b.factorId, c),
  );
  workspaceRoute(router, "post", "/me/security/mfa/:id/remove", emptyBody, (a, _b, p, _q, c) =>
    service.removeFactor(a, routeParam(p, "id"), c),
  );
  workspaceRoute(router, "post", "/auth/logout-all", emptyBody, (a, _b, _p, _q, c) => service.logout(a, c));
  return router;
}
