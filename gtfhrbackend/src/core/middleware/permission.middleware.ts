import type { RequestHandler } from "express";
import { requireCapability } from "../security/actor.js";
import type { Capability } from "../security/capabilities.js";
import { AuthenticationError } from "../errors/AuthenticationError.js";

/** Rejects callers without `capability` (403). Place after `authenticate`. */
export function requirePermission(capability: Capability): RequestHandler {
  return (request, _response, next) => {
    if (!request.actor) throw new AuthenticationError("INVALID_TOKEN", "The access token is invalid.");
    requireCapability(request.actor, capability);
    next();
  };
}
