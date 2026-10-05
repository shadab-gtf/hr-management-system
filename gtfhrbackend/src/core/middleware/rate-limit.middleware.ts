import { rateLimit } from "express-rate-limit";
import { LOGIN_RATE_LIMIT } from "../../utils/constants.js";
import { sendProblem } from "../../utils/response.js";

/** Per-IP sign-in throttle. A factory so each app instance (and test) gets its own counter. */
export function loginRateLimit() {
  return rateLimit({
    windowMs: LOGIN_RATE_LIMIT.windowMs,
    limit: LOGIN_RATE_LIMIT.limit,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (request, response) => {
      sendProblem(response, request.requestId, 429, "RATE_LIMITED", "Too many sign-in attempts. Try again later.", {
        retryable: true,
      });
    },
  });
}
