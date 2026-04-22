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

let _schema: ReturnType<typeof auth.api.generateOpenAPISchema>;
// biome-ignore lint/suspicious/noAssignInExpressions: memoization pattern from better-auth docs
const getSchema = async () => (_schema ??= auth.api.generateOpenAPISchema());

/**
 * Adds validation constraints and PT-BR error messages to a properties object.
 * Better-auth generates schemas with bare `{ type: "string" }` properties.
 * This overlay adds format, minLength, and maxLength constraints so
 * Kubb can generate Zod schemas with proper validations on the frontend.
 */
// biome-ignore lint/suspicious/noExplicitAny: OpenAPI schema typing from better-auth
function enhanceAuthProperties(properties: Record<string, any>): void {
  if (properties.email) {
    properties.email.format = "email";
    properties.email.minLength = 1;
    properties.email["x-error-messages"] = {
      "string_format:email": "Email inválido",
      min_length: "Email é obrigatório",
    };
  }

  if (properties.password) {
    properties.password.minLength = 8;
    properties.password["x-error-messages"] = {
      min_length: "Senha deve ter no mínimo 8 caracteres",
    };
  }

  if (properties.newPassword) {
    properties.newPassword.minLength = 8;
    properties.newPassword["x-error-messages"] = {
      min_length: "Nova senha deve ter no mínimo 8 caracteres",
    };
  }

  if (properties.currentPassword) {
    properties.currentPassword.minLength = 8;
    properties.currentPassword["x-error-messages"] = {
      min_length: "Senha atual deve ter no mínimo 8 caracteres",
    };
  }

  if (properties.name) {
    properties.name.minLength = 2;
    properties.name.maxLength = 100;
    properties.name["x-error-messages"] = {
      min_length: "Nome deve ter no mínimo 2 caracteres",
      max_length: "Nome deve ter no máximo 100 caracteres",
    };
  }
}

// biome-ignore lint/suspicious/noExplicitAny: OpenAPI schema typing from better-auth
function addValidationsToComponents(components: any): void {
  const schemas = components?.schemas;
  if (!schemas) {
    return;
  }

  for (const schema of Object.values(schemas)) {
    const properties = (schema as Record<string, unknown>)?.properties;
    if (properties) {
      enhanceAuthProperties(properties as Record<string, unknown>);
    }
  }
}

// biome-ignore lint/suspicious/noExplicitAny: OpenAPI schema typing from better-auth
function addValidationsToPaths(paths: Record<string, any>): void {
  for (const methods of Object.values(paths)) {
    for (const operation of Object.values(methods as Record<string, unknown>)) {
      // biome-ignore lint/suspicious/noExplicitAny: deeply nested OpenAPI schema traversal
      const properties = (operation as Record<string, any>)?.requestBody
        ?.content?.["application/json"]?.schema?.properties;
      if (properties) {
        enhanceAuthProperties(properties);
      }
    }
  }
}

export const OpenAPI = {
  getPaths: (prefix = "/api/auth") =>
    getSchema().then(({ paths }) => {
      const reference: typeof paths = Object.create(null);

      for (const path of Object.keys(paths)) {
        const key = prefix + path;
        reference[key] = paths[path];

        for (const method of Object.keys(paths[path])) {
          // biome-ignore lint/suspicious/noExplicitAny: OpenAPI schema typing from better-auth
          const operation = (reference[key] as any)[method];

          operation.tags = ["Better Auth"];
        }
      }

      addValidationsToPaths(reference);
      return reference;
      // biome-ignore lint/suspicious/noExplicitAny: OpenAPI schema typing from better-auth
    }) as Promise<any>,
  components: getSchema().then(({ components }) => {
    addValidationsToComponents(components);
    return components;
    // biome-ignore lint/suspicious/noExplicitAny: OpenAPI schema typing from better-auth
  }) as Promise<any>,
} as const;
