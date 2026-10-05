import { z } from "zod";

export const memberSchema = z.object({
  id: z.string(),
  name: z.string(),
  initials: z.string(),
  jobTitle: z.string(),
  department: z.enum(["Design", "Engineering", "People"]),
  location: z.string(),
  status: z.enum(["Active", "On leave", "Onboarding"]),
  color: z.enum(["magenta", "cyan", "yellow"]),
});
export const foundationSchema = z.object({
  source: z.literal("synthetic"),
  members: z.array(memberSchema),
  departments: z.array(z.string()),
});
export type Member = z.infer<typeof memberSchema>;
export type FoundationData = z.infer<typeof foundationSchema>;
export type ThemePreference = "light" | "dark" | "system";
