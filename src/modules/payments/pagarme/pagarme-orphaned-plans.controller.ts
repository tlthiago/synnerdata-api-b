import { Elysia } from "elysia";
import { isProduction } from "@/env";
import { wrapSuccess } from "@/lib/responses/envelope";
import {
  forbiddenErrorSchema,
  unauthorizedErrorSchema,
} from "@/lib/responses/response.types";
import { betterAuthPlugin } from "@/plugins/auth-guard/auth-plugin";
import {
  cleanupOrphanedPlansResponseSchema,
  listOrphanedPlansResponseSchema,
} from "./pagarme-orphaned-plans.model";
import { OrphanedPlansService } from "./pagarme-orphaned-plans.service";

export const orphanedPlansController = new Elysia({
  name: "orphaned-plans",
  prefix: "/admin/pagarme/orphaned-plans",
  detail: { tags: ["Payments - Admin Pagarme"] },
})
  .use(betterAuthPlugin)
  .get(
    "/",
    async () => wrapSuccess(await OrphanedPlansService.listOrphaned()),
    {
      auth: { requireAdmin: true },
      response: {
        200: listOrphanedPlansResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
      },
      detail: {
        hide: isProduction,
        summary: "List orphaned Pagar.me plans",
        description:
          "Lists all Pagar.me plans that are no longer referenced by any active pricing tier.",
      },
    }
  )
  .post(
    "/cleanup",
    async () => wrapSuccess(await OrphanedPlansService.cleanup()),
    {
      auth: { requireAdmin: true },
      response: {
        200: cleanupOrphanedPlansResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
      },
      detail: {
        hide: isProduction,
        summary: "Cleanup orphaned Pagar.me plans",
        description:
          "Deactivates orphaned Pagar.me plans that have no active subscriptions. Plans with active subscriptions are kept.",
      },
    }
  );
