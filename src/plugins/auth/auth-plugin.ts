import { Elysia } from "elysia";
import { type AuthSession, type AuthUser, auth } from "@/lib/auth";
import { ForbiddenError, UnauthorizedError } from "@/lib/errors/http-errors";
import {
  FeatureNotAvailableError,
  SubscriptionRequiredError,
} from "@/lib/errors/subscription-errors";
import { logger } from "@/lib/logger";
import type { OrgPermissions } from "@/lib/permissions";
import { LimitsService } from "@/modules/payments/limits/limits.service";
import { SubscriptionService } from "@/modules/payments/subscription/subscription.service";

export type AuthOptions =
  | true
  | {
      permissions?: OrgPermissions;
      requireOrganization?: boolean;
      requireAdmin?: boolean;
      requireSuperAdmin?: boolean;
      requireActiveSubscription?: boolean;
      requireFeature?: string;
      requireFeatures?: string[];
      allowAdminBypass?: boolean;
    };

type ParsedAuthOptions = {
  permissions?: OrgPermissions;
  requireOrganization: boolean;
  requireAdmin: boolean;
  requireSuperAdmin: boolean;
  requireActiveSubscription: boolean;
  requireFeature?: string;
  requireFeatures?: string[];
  allowAdminBypass: boolean;
};

class NoActiveOrganizationError extends ForbiddenError {
  code = "NO_ACTIVE_ORGANIZATION";

  constructor() {
    super("No active organization selected");
  }
}

class AdminRequiredError extends ForbiddenError {
  constructor() {
    super("Admin access required");
  }
}

class SuperAdminRequiredError extends ForbiddenError {
  constructor() {
    super("Super admin access required");
  }
}

function parseOptions(options: AuthOptions): ParsedAuthOptions | null {
  if (typeof options !== "object") {
    return null;
  }
  return {
    permissions: options.permissions,
    requireOrganization: options.requireOrganization ?? false,
    requireAdmin: options.requireAdmin ?? false,
    requireSuperAdmin: options.requireSuperAdmin ?? false,
    requireActiveSubscription: options.requireActiveSubscription ?? false,
    requireFeature: options.requireFeature,
    requireFeatures: options.requireFeatures,
    allowAdminBypass: options.allowAdminBypass ?? true,
  };
}

function isSystemAdmin(role: string | null | undefined): boolean {
  return role === "admin" || role === "super_admin";
}

function isSuperAdmin(role: string | null | undefined): boolean {
  return role === "super_admin";
}

function validateRoleRequirements(
  userRole: string | undefined,
  options: ParsedAuthOptions
): void {
  if (options.requireSuperAdmin && !isSuperAdmin(userRole)) {
    throw new SuperAdminRequiredError();
  }
  if (options.requireAdmin && !isSystemAdmin(userRole)) {
    throw new AdminRequiredError();
  }
}

function isApiKeyRequest(headers: Headers): boolean {
  return !!headers.get("x-api-key");
}

function extractClientIp(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() ?? null;
  }
  return headers.get("x-real-ip");
}

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

function canBypassSubscriptionCheck(
  user: AuthUser,
  headers: Headers,
  allowBypass: boolean
): boolean {
  if (!allowBypass) {
    return false;
  }
  return isSystemAdmin(user.role) || isApiKeyRequest(headers);
}

async function resolveApiKeyOrgContext(
  headers: Headers
): Promise<string | null> {
  const apiKey = headers.get("x-api-key");
  if (!apiKey) {
    return null;
  }

  const result = await auth.api.verifyApiKey({
    body: { key: apiKey },
  });

  if (!(result.valid && result.key?.metadata)) {
    return null;
  }

  const metadata = result.key.metadata as { organizationId?: string | null };
  return metadata.organizationId ?? null;
}

async function validateActiveSubscription(
  organizationId: string
): Promise<void> {
  const access = await SubscriptionService.checkAccess(organizationId);
  if (!access.hasAccess) {
    throw new SubscriptionRequiredError(access.status);
  }
}

async function validateFeatureAccess(
  organizationId: string,
  featureName: string
): Promise<void> {
  const result = await LimitsService.checkFeature(organizationId, featureName);
  if (!result.hasAccess) {
    throw new FeatureNotAvailableError(
      result.featureDisplayName,
      result.requiredPlan ?? undefined
    );
  }
}

function needsSubscriptionValidation(options: ParsedAuthOptions): boolean {
  return (
    options.requireActiveSubscription ||
    !!options.requireFeature ||
    (options.requireFeatures !== undefined &&
      options.requireFeatures.length > 0)
  );
}

async function validateSubscriptionAndFeatures(
  organizationId: string | null,
  options: ParsedAuthOptions,
  canBypass: boolean
): Promise<void> {
  if (canBypass) {
    return;
  }

  if (!organizationId) {
    if (needsSubscriptionValidation(options)) {
      throw new NoActiveOrganizationError();
    }
    return;
  }

  if (options.requireActiveSubscription) {
    await validateActiveSubscription(organizationId);
  }

  if (options.requireFeature) {
    await validateFeatureAccess(organizationId, options.requireFeature);
  }

  if (options.requireFeatures) {
    for (const feature of options.requireFeatures) {
      await validateFeatureAccess(organizationId, feature);
    }
  }
}

async function validatePermissions(
  headers: Headers,
  session: AuthSession,
  options: ParsedAuthOptions
): Promise<void> {
  if (options.requireOrganization && !session.activeOrganizationId) {
    throw new NoActiveOrganizationError();
  }

  if (options.permissions) {
    // API keys have their own read-only permission model — skip org role check
    if (isApiKeyRequest(headers)) {
      return;
    }

    // biome-ignore lint/suspicious/noExplicitAny: Better Auth API typing limitation
    const { success } = await (auth.api as any).hasPermission({
      headers,
      body: { permissions: options.permissions },
    });
    if (!success) {
      throw new ForbiddenError();
    }
  }
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
