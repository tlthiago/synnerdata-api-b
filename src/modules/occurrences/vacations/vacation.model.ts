import { z } from "zod";
import { vacationStatusEnum } from "@/db/schema";
import { successResponseSchema } from "@/lib/responses/response.types";
import { entityReferenceSchema } from "@/lib/schemas/relationships";

const vacationStatuses = vacationStatusEnum.enumValues;

export const createVacationSchema = z
  .object({
    employeeId: z
      .string()
      .min(1, "Employee ID is required")
      .describe("Employee ID"),
    startDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD)")
      .describe("Vacation start date (YYYY-MM-DD)"),
    endDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD)")
      .describe("Vacation end date (YYYY-MM-DD)"),
    daysTotal: z
      .number()
      .int()
      .positive("Total days must be positive")
      .describe("Total vacation days"),
    daysUsed: z
      .number()
      .int()
      .nonnegative("Days used cannot be negative")
      .describe("Days used"),
    acquisitionPeriodStart: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD)")
      .describe("Acquisition period start date (YYYY-MM-DD)"),
    acquisitionPeriodEnd: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD)")
      .describe("Acquisition period end date (YYYY-MM-DD)"),
    status: z
      .enum(vacationStatuses)
      .default("scheduled")
      .describe("Vacation status"),
    notes: z.string().optional().describe("Optional notes"),
  })
  .refine((data) => data.startDate <= data.endDate, {
    message: "Start date must be before or equal to end date",
    path: ["endDate"],
  })
  .refine((data) => data.daysUsed <= data.daysTotal, {
    message: "Days used cannot exceed total days",
    path: ["daysUsed"],
  });

export const updateVacationSchema = createVacationSchema
  .omit({ employeeId: true })
  .partial();

const vacationDataSchema = z.object({
  id: z.string().describe("Vacation ID"),
  organizationId: z.string().describe("Organization ID"),
  employee: entityReferenceSchema.describe("Employee"),
  startDate: z.string().describe("Vacation start date"),
  endDate: z.string().describe("Vacation end date"),
  daysTotal: z.number().describe("Total vacation days"),
  daysUsed: z.number().describe("Days used"),
  acquisitionPeriodStart: z.string().describe("Acquisition period start date"),
  acquisitionPeriodEnd: z.string().describe("Acquisition period end date"),
  status: z.enum(vacationStatuses).describe("Vacation status"),
  notes: z.string().nullable().describe("Notes"),
  createdAt: z.coerce.date().describe("Creation date"),
  updatedAt: z.coerce.date().describe("Last update date"),
});

const deletedVacationDataSchema = vacationDataSchema.extend({
  deletedAt: z.coerce.date().describe("Deletion date"),
  deletedBy: z.string().nullable().describe("ID of user who deleted"),
});

const vacationListDataSchema = z.array(vacationDataSchema);

export const createVacationResponseSchema =
  successResponseSchema(vacationDataSchema);
export const getVacationResponseSchema =
  successResponseSchema(vacationDataSchema);
export const updateVacationResponseSchema =
  successResponseSchema(vacationDataSchema);
export const deleteVacationResponseSchema = successResponseSchema(
  deletedVacationDataSchema
);
export const listVacationsResponseSchema = successResponseSchema(
  vacationListDataSchema
);

export type CreateVacation = z.infer<typeof createVacationSchema>;
export type CreateVacationInput = CreateVacation & {
  organizationId: string;
  userId: string;
};

export type UpdateVacation = z.infer<typeof updateVacationSchema>;
export type UpdateVacationInput = UpdateVacation & {
  userId: string;
};

export type VacationData = z.infer<typeof vacationDataSchema>;
export type DeletedVacationData = z.infer<typeof deletedVacationDataSchema>;
export type VacationStatus = (typeof vacationStatuses)[number];
