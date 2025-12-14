import { Elysia, t } from "elysia";
import { env } from "@/env";
import { unauthorizedErrorSchema } from "@/lib/responses/response.types";
import {
  expireTrialsResponseSchema,
  notifyExpiringTrialsResponseSchema,
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
      .post("/expire-trials", () => JobsService.expireTrials(), {
        response: {
          200: expireTrialsResponseSchema,
          401: unauthorizedErrorSchema,
        },
        detail: {
          summary: "Expire overdue trials",
          description:
            "Manually trigger the job that expires all trials past their end date.",
        },
      })
      .post(
        "/notify-expiring-trials",
        () => JobsService.notifyExpiringTrials(),
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
);
