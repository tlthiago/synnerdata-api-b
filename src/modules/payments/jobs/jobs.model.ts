import { z } from "zod";
import { successResponseSchema } from "@/lib/responses/response.types";

const expireTrialsDataSchema = z.object({
  processed: z.number().describe("Total trials processed"),
  expired: z.array(z.string()).describe("IDs of expired subscriptions"),
});

export const expireTrialsResponseSchema = successResponseSchema(
  expireTrialsDataSchema
);

const notifyExpiringTrialsDataSchema = z.object({
  processed: z.number().describe("Total trials processed"),
  notified: z.array(z.string()).describe("IDs of notified subscriptions"),
});

export const notifyExpiringTrialsResponseSchema = successResponseSchema(
  notifyExpiringTrialsDataSchema
);

export type ExpireTrialsData = z.infer<typeof expireTrialsDataSchema>;
export type ExpireTrialsResponse = z.infer<typeof expireTrialsResponseSchema>;
export type NotifyExpiringTrialsData = z.infer<
  typeof notifyExpiringTrialsDataSchema
>;
export type NotifyExpiringTrialsResponse = z.infer<
  typeof notifyExpiringTrialsResponseSchema
>;

const processScheduledCancellationsDataSchema = z.object({
  processed: z.number().describe("Total subscriptions processed"),
  canceled: z.array(z.string()).describe("IDs of canceled subscriptions"),
});

export const processScheduledCancellationsResponseSchema =
  successResponseSchema(processScheduledCancellationsDataSchema);

export type ProcessScheduledCancellationsData = z.infer<
  typeof processScheduledCancellationsDataSchema
>;
export type ProcessScheduledCancellationsResponse = z.infer<
  typeof processScheduledCancellationsResponseSchema
>;

const processScheduledPlanChangesDataSchema = z.object({
  processed: z.number().describe("Total scheduled changes processed"),
  executed: z.array(z.string()).describe("IDs of executed plan changes"),
  failed: z.array(z.string()).describe("IDs of failed plan changes"),
});

export const processScheduledPlanChangesResponseSchema = successResponseSchema(
  processScheduledPlanChangesDataSchema
);

export type ProcessScheduledPlanChangesData = z.infer<
  typeof processScheduledPlanChangesDataSchema
>;
export type ProcessScheduledPlanChangesResponse = z.infer<
  typeof processScheduledPlanChangesResponseSchema
>;

const suspendExpiredGracePeriodsDataSchema = z.object({
  processed: z.number().describe("Total subscriptions processed"),
  suspended: z.array(z.string()).describe("IDs of suspended subscriptions"),
});

export const suspendExpiredGracePeriodsResponseSchema = successResponseSchema(
  suspendExpiredGracePeriodsDataSchema
);

export type SuspendExpiredGracePeriodsData = z.infer<
  typeof suspendExpiredGracePeriodsDataSchema
>;
