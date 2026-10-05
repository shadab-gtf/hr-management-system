/**
 * UI command result (system/brain/state-management.md "Command lifecycle").
 * This is presentation flow only; the domain state lives on the server.
 */
export type ActionResult =
  | { status: "idle" }
  | {
      status: "success";
      message: string;
      reference?: string;
      at: string;
    }
  | {
      status: "error";
      message: string;
      code: string;
      fieldErrors?: Record<string, string>;
      retryable: boolean;
    };

export const idleResult: ActionResult = { status: "idle" };
