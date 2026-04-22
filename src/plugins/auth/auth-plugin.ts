import { Elysia } from "elysia";
import { type AuthSession, type AuthUser, auth } from "@/lib/auth";
import { UnauthorizedError } from "@/lib/errors/http-errors";
import { logger } from "@/lib/logger";
import { type AuthOptions, parseOptions } from "@/plugins/auth/options";
import {
  canBypassSubscriptionCheck,
  extractClientIp,
  isApiKeyRequest,
  resolveApiKeyOrgContext,
  validatePermissions,
  validateRoleRequirements,
  validateSubscriptionAndFeatures,
} from "@/plugins/auth/validators";

export type AuthContext = {
  user: AuthUser;
  session: AuthSession;
};

function logUnauthorizedAccess(request: Request): void {
  const { headers, method, url } = request;
  logger.warn({
    type: "security:unauthorized_access",
    method,
    path: new URL(url).pathname,
    ip: extractClientIp(headers),
    userAgent: headers.get("user-agent"),
    hasApiKey: isApiKeyRequest(headers),
  });
}

export const betterAuthPlugin = new Elysia({ name: "better-auth" })
  .mount(auth.handler)
  .macro({
    auth: (options: AuthOptions) => ({
      resolve: async ({ request }) => {
        const { headers } = request;
        const result = await auth.api.getSession({ headers });

        if (!result) {
          logUnauthorizedAccess(request);
          throw new UnauthorizedError();
        }

        const user = result.user as AuthUser;
        const session = result.session as AuthSession;

        // Inject org context from API key metadata (mock session lacks activeOrganizationId)
        if (isApiKeyRequest(headers) && !session.activeOrganizationId) {
          const orgId = await resolveApiKeyOrgContext(headers);
          if (orgId) {
            session.activeOrganizationId = orgId;
          }
        }

        const parsed = parseOptions(options);
        if (!parsed) {
          return { user, session };
        }

        validateRoleRequirements(user.role, parsed);
        await validatePermissions(headers, session, parsed);

        const canBypass = canBypassSubscriptionCheck(
          user,
          headers,
          parsed.allowAdminBypass
        );
        await validateSubscriptionAndFeatures(
          session.activeOrganizationId,
          parsed,
          canBypass
        );

        return { user, session };
      },
    }),
  });
