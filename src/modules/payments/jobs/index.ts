import { Elysia, t } from "elysia";
import { env } from "@/env";
import { wrapSuccess } from "@/lib/responses/envelope";
import { unauthorizedErrorSchema } from "@/lib/responses/response.types";
import {
  expireTrialsResponseSchema,
  notifyExpiringTrialsResponseSchema,
  processScheduledCancellationsResponseSchema,
  processScheduledPlanChangesResponseSchema,
  suspendExpiredGracePeriodsResponseSchema,
} from "./jobs.model";
import { JobsService } from "./jobs.service";

export const jobsController = new Elysia({
  name: "payment-jobs",
  prefix: "/jobs",
  detail: { tags: ["Payments - Jobs"] },
}).guard(
  {
    headers: t.Object({
      "x-api-key": t.String(),
    }),
    beforeHandle: ({ headers, set }) => {
      if (headers["x-api-key"] !== env.INTERNAL_API_KEY) {
        set.status = 401;
        return {
          success: false as const,
          error: { code: "UNAUTHORIZED", message: "Invalid API key" },
        };
      }
    },
  },
  (app) =>
    app
      .post(
        "/expire-trials",
        async () => wrapSuccess(await JobsService.expireTrials()),
        {
          response: {
            200: expireTrialsResponseSchema,
            401: unauthorizedErrorSchema,
          },
          detail: {
            summary: "Expire overdue trials",
            description:
              "Manually trigger the job that expires all trials past their end date.",
          },
        }
      )
      .post(
        "/notify-expiring-trials",
        async () => wrapSuccess(await JobsService.notifyExpiringTrials()),
        {
          response: {
            200: notifyExpiringTrialsResponseSchema,
            401: unauthorizedErrorSchema,
          },
          detail: {
            summary: "Notify trials expiring in 3 days",
            description:
              "Manually trigger the job that sends notification emails to users whose trials expire in 3 days.",
          },
        }
      )
      .post(
        "/process-cancellations",
        async () =>
          wrapSuccess(await JobsService.processScheduledCancellations()),
        {
          response: {
            200: processScheduledCancellationsResponseSchema,
            401: unauthorizedErrorSchema,
          },
          detail: {
            summary: "Process scheduled cancellations",
            description:
              "Manually trigger the job that cancels subscriptions on Pagar.me that reached their period end.",
          },
        }
      )
      .post(
        "/suspend-expired-grace-periods",
        async () => wrapSuccess(await JobsService.suspendExpiredGracePeriods()),
        {
          response: {
            200: suspendExpiredGracePeriodsResponseSchema,
            401: unauthorizedErrorSchema,
          },
          detail: {
            summary: "Suspend expired grace periods",
            description:
              "Manually trigger the job that suspends subscriptions with expired grace periods (past_due > 15 days).",
          },
        }
      )
      .post(
        "/process-scheduled-plan-changes",
        async () =>
          wrapSuccess(await JobsService.processScheduledPlanChanges()),
        {
          response: {
            200: processScheduledPlanChangesResponseSchema,
            401: unauthorizedErrorSchema,
          },
          detail: {
            summary: "Process scheduled plan changes",
            description:
              "Manually trigger the job that executes scheduled plan changes (downgrades) at the end of the billing period.",
          },
        }
      )
);
