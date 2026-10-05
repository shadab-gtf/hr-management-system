import type { AuthenticatedActor } from "../core/security/actor.js";

declare global {
  namespace Express {
    interface Request {
      /** Set by `authenticate`. */
      actor?: AuthenticatedActor;
      /** Set by `requestId`, the first middleware. */
      requestId: string;
    }
    interface Locals {
      /** Parsed inputs stored by `validate()`. */
      body?: unknown;
      query?: unknown;
      params?: unknown;
    }
  }
}

export {};
