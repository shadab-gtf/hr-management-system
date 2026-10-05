import { z } from "zod";
import { EMPLOYMENT_STATUSES, EMPLOYMENT_TYPES } from "../../utils/constants.js";

export const listEmployeesQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  department: z.string().trim().max(60).optional(),
  location: z.string().trim().max(60).optional(),
  status: z.enum(EMPLOYMENT_STATUSES).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export const createEmployeeSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3)
    .max(80)
    .regex(/^[\p{L} .'-]+$/u),
  workEmail: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  designation: z.string().trim().min(2).max(80),
  department: z.string().trim().min(1).max(60),
  location: z.string().trim().min(1).max(60),
  managerId: z.string().min(1),
  joinedOn: z.iso.date(),
  type: z.enum(EMPLOYMENT_TYPES),
  probationMonths: z.union([z.number().int().min(0).max(6), z.literal("")]).optional(),
});

const probationMonths = z.number().int().min(0).max(6);
export const probationDefaultsSchema = z.object({
  full_time: probationMonths,
  contract: probationMonths,
  intern: probationMonths,
});

export type ListEmployeesQuery = z.output<typeof listEmployeesQuerySchema>;
export type CreateEmployeeInput = z.output<typeof createEmployeeSchema>;
