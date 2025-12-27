import { cors } from "@elysiajs/cors";
import { Elysia } from "elysia";
import { env } from "@/env";
import { betterAuthPlugin } from "@/lib/auth-plugin";
import { errorPlugin } from "@/lib/errors/error-plugin";
import { healthPlugin } from "@/lib/health";
import { loggerPlugin } from "@/lib/logger";
import { apiKeysController } from "@/modules/api-keys";
import { auditController } from "@/modules/audit";
import { employeeController } from "@/modules/employees";
import { occurrencesController } from "@/modules/occurrences";
import { organizationController } from "@/modules/organizations";
import { branchController } from "@/modules/organizations/branches";
import { costCenterController } from "@/modules/organizations/cost-centers";
import { jobClassificationController } from "@/modules/organizations/job-classifications";
import { jobPositionController } from "@/modules/organizations/job-positions";
import { ppeItemController } from "@/modules/organizations/ppe-items";
import { projectController } from "@/modules/organizations/projects";
import { sectorController } from "@/modules/organizations/sectors";
import { paymentsController } from "@/modules/payments";

export function createTestApp() {
  return new Elysia()
    .use(errorPlugin)
    .use(loggerPlugin)
    .use(healthPlugin)
    .use(
      cors({
        origin: env.CORS_ORIGIN,
        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        credentials: true,
        allowedHeaders: ["Content-Type", "Authorization"],
      })
    )
    .use(betterAuthPlugin)
    .use(organizationController)
    .use(branchController)
    .use(sectorController)
    .use(costCenterController)
    .use(jobPositionController)
    .use(jobClassificationController)
    .use(ppeItemController)
    .use(projectController)
    .use(employeeController)
    .use(occurrencesController)
    .use(paymentsController)
    .use(auditController)
    .use(apiKeysController)
    .get("/", ({ redirect }) => redirect("/health"));
}

export type TestApp = ReturnType<typeof createTestApp>;
