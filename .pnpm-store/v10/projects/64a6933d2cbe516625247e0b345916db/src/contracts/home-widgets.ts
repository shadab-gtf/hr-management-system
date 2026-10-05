import { z } from "zod";
import { isoDateSchema, personRefSchema } from "./common.js";

/** "Who's on leave" home widget: approved leave today and in the next 7 days, scoped to the viewer. */
export const whoIsOutSchema = z.object({
  scope: z.enum(["team", "department", "organization"]),
  today: z.array(z.object({ person: personRefSchema, leaveType: z.string(), until: isoDateSchema })),
  upcoming: z.array(z.object({ person: personRefSchema, leaveType: z.string(), from: isoDateSchema, to: isoDateSchema })),
});

export type WhoIsOut = z.infer<typeof whoIsOutSchema>;
