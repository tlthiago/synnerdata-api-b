import { Elysia } from "elysia";
import { wrapSuccessWithMessage } from "@/lib/responses/envelope";
import {
  badRequestErrorSchema,
  unauthorizedErrorSchema,
  validationErrorSchema,
} from "@/lib/responses/response.types";
import { betterAuthPlugin } from "@/plugins/auth-guard/auth-plugin";
import {
  anonymizeRequestSchema,
  anonymizeResponseSchema,
} from "./anonymize.model";
import { AnonymizeService } from "./anonymize.service";

export const anonymizeController = new Elysia({
  name: "anonymize",
  prefix: "/account",
  detail: { tags: ["Account"] },
})
  .use(betterAuthPlugin)
  .post(
    "/anonymize",
    async ({ user, body, request }) => {
      await AnonymizeService.anonymize({
        userId: user.id,
        password: body.password,
        requestHeaders: request.headers,
      });
      return wrapSuccessWithMessage(null, "Conta anonimizada com sucesso.");
    },
    {
      auth: true,
      body: anonymizeRequestSchema,
      response: {
        200: anonymizeResponseSchema,
        400: badRequestErrorSchema,
        401: unauthorizedErrorSchema,
        422: validationErrorSchema,
      },
      detail: {
        summary: "Anonymize current user account",
        description:
          "Irreversibly anonymizes the authenticated user. Overwrites PII fields, deletes Better Auth credential rows (sessions, accounts, two-factor secrets, API keys, invitations), and cascades a sole-owned trial organization. Records the action in the audit log.",
      },
    }
  );
