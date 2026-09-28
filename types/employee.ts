import { z } from "zod";
import { isoDateSchema, listSchema, personRefSchema } from "@/types/common";

export const employmentStatusSchema = z.enum([
  "active",
  "on_leave",
  "onboarding",
  "notice",
  "exited",
]);
export const employmentTypeSchema = z.enum(["full_time", "contract", "intern"]);

/** Directory-safe projection: no personal contact, bank, tax, birth or salary. */
export const employeeListItemSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  initials: z.string(),
  designation: z.string(),
  department: z.string(),
  location: z.string(),
  workEmail: z.string(),
  /** Present only in the HR projection. */
  status: employmentStatusSchema.optional(),
  joinedOn: isoDateSchema.optional(),
});

export const employeeListSchema = listSchema(employeeListItemSchema);

export const employeeFacetsSchema = z.object({
  departments: z.array(z.string()),
  locations: z.array(z.string()),
  statuses: z.array(employmentStatusSchema),
});

export const employmentEventSchema = z.object({
  id: z.string(),
  kind: z.enum(["joined", "promotion", "transfer", "manager_change", "confirmation"]),
  title: z.string(),
  detail: z.string(),
  effectiveOn: isoDateSchema,
  recordedOn: isoDateSchema,
});

export const employeeDetailSchema = employeeListItemSchema.extend({
  status: employmentStatusSchema,
  joinedOn: isoDateSchema,
  employmentType: employmentTypeSchema,
  legalEntity: z.string(),
  costCenter: z.string(),
  workPhone: z.string().nullable(),
  manager: personRefSchema.nullable(),
  directReports: z.array(personRefSchema),
  timeline: z.array(employmentEventSchema),
  /** Field projection: private details present only for self/HR scope. */
  privateProfile: z
    .object({
      personalEmail: z.string(),
      mobile: z.string(),
      emergencyContact: z.string(),
      address: z.string(),
      bankAccountMasked: z.string(),
    })
    .nullable(),
  permissions: z.object({
    canEdit: z.boolean(),
    canViewPrivate: z.boolean(),
    canRequestChange: z.boolean(),
  }),
});

export const employeeFiltersSchema = z.object({
  q: z.string().trim().max(100).optional(),
  department: z.string().max(60).optional(),
  location: z.string().max(60).optional(),
  status: employmentStatusSchema.optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export const profileChangeFieldSchema = z.enum([
  "mobile",
  "personalEmail",
  "address",
  "emergencyContact",
  "bankAccount",
]);

export type EmploymentStatus = z.infer<typeof employmentStatusSchema>;
export type EmployeeListItem = z.infer<typeof employeeListItemSchema>;
export type EmployeeList = z.infer<typeof employeeListSchema>;
export type EmployeeFacets = z.infer<typeof employeeFacetsSchema>;
export type EmployeeDetail = z.infer<typeof employeeDetailSchema>;
export type EmploymentEvent = z.infer<typeof employmentEventSchema>;
export type EmployeeFilters = z.infer<typeof employeeFiltersSchema>;
export type ProfileChangeField = z.infer<typeof profileChangeFieldSchema>;
