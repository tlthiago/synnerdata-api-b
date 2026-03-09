import { sql } from "drizzle-orm";
import { Elysia } from "elysia";
import { db } from "@/db";
import {
  type HealthCheck,
  type HealthResponse,
  healthResponseSchema,
  type LiveResponse,
  liveResponseSchema,
} from "./health.model";

async function checkDatabase(): Promise<HealthCheck> {
  const start = performance.now();
  try {
    await db.execute(sql`SELECT 1`);
    return {
      status: "healthy",
      latencyMs: Math.round(performance.now() - start),
    };
  } catch {
    return { status: "unhealthy" };
  }
}

export const healthPlugin = new Elysia({
  name: "health",
  prefix: "/health",
  detail: { tags: ["Infrastructure"] },
})
  .get(
    "/",
    async (): Promise<HealthResponse> => {
      const checks: Record<string, HealthCheck> = {
        database: await checkDatabase(),
      };

      const isHealthy = Object.values(checks).every(
        (c) => c.status === "healthy"
      );

      return {
        success: true,
        data: {
          status: isHealthy ? "healthy" : "unhealthy",
          version: process.env.npm_package_version ?? "1.0.50",
          uptime: Math.round(process.uptime()),
          checks,
        },
      };
    },
    {
      response: { 200: healthResponseSchema },
      detail: {
        summary: "Health check",
        description:
          "Returns overall API health status with individual service checks.",
      },
    }
  )
  .get(
    "/live",
    (): LiveResponse => ({ success: true, data: { status: "ok" } }),
    {
      response: { 200: liveResponseSchema },
      detail: {
        summary: "Liveness probe",
        description: "Simple endpoint for load balancer health checks.",
      },
    }
  );
