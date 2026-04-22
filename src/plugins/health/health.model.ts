import { z } from "zod";
import { successResponseSchema } from "@/lib/responses/response.types";

const healthCheckSchema = z.object({
  status: z.enum(["healthy", "unhealthy"]).describe("Check status"),
  latencyMs: z.number().optional().describe("Latency in milliseconds"),
});

const healthDataSchema = z.object({
  status: z.enum(["healthy", "unhealthy"]).describe("Overall health status"),
  version: z.string().describe("API version"),
  uptime: z.number().describe("Uptime in seconds"),
  checks: z
    .record(z.string(), healthCheckSchema)
    .describe("Individual service checks"),
});

export const healthResponseSchema = successResponseSchema(healthDataSchema);

const liveDataSchema = z.object({
  status: z.literal("ok").describe("Liveness status"),
});

export const liveResponseSchema = successResponseSchema(liveDataSchema);

export type HealthCheck = z.infer<typeof healthCheckSchema>;
export type HealthData = z.infer<typeof healthDataSchema>;
export type HealthResponse = z.infer<typeof healthResponseSchema>;
export type LiveResponse = z.infer<typeof liveResponseSchema>;
