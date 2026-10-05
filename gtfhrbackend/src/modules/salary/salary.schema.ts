import { z } from "zod";
export { declarationInputSchema, loanInputSchema } from "../../contracts/salary.js";
export const loanDecisionSchema = z.object({
  decision: z.enum(["approve", "reject"]),
  note: z.string().trim().min(3).max(300),
});
