import { Elysia } from "elysia";
import { type AuthSession, type AuthUser, auth } from "./auth";
import { ForbiddenError, UnauthorizedError } from "./errors/http-errors";
import type { OrgPermissions } from "./permissions";

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

function isApiKeyAuthentication(session: AuthSession): boolean {
  return !!(session as AuthSession & { apiKeyId?: string }).apiKeyId;
}

function canBypassSubscriptionCheck(
  user: AuthUser,
  session: AuthSession,
  allowBypass: boolean
): boolean {
  if (!allowBypass) {
    return false;
  }
  return isSystemAdmin(user.role) || isApiKeyAuthentication(session);
}

async function validateActiveSubscription(
  organizationId: string
): Promise<void> {
  const { SubscriptionService } = await import("@/modules/payments");
  const access = await SubscriptionService.checkAccess(organizationId);
  if (!access.hasAccess) {
    const { SubscriptionRequiredError } = await import(
      "./errors/subscription-errors"
    );
    throw new SubscriptionRequiredError(access.status);
  }
}

async function validateFeatureAccess(
  organizationId: string,
  featureName: string
): Promise<void> {
  const { LimitsService } = await import("@/modules/payments");
  const result = await LimitsService.checkFeature(organizationId, featureName);
  if (!result.hasAccess) {
    const { FeatureNotAvailableError } = await import(
      "./errors/subscription-errors"
    );
    throw new FeatureNotAvailableError(
      featureName,
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
      resolve: async ({ request: { headers } }) => {
        const result = await auth.api.getSession({ headers });

        if (!result) {
          throw new UnauthorizedError();
        }

        const user = result.user as AuthUser;
        const session = result.session as AuthSession;

        const parsed = parseOptions(options);
        if (!parsed) {
          return { user, session };
        }

        validateRoleRequirements(user.role, parsed);
        await validatePermissions(headers, session, parsed);

        const canBypass = canBypassSubscriptionCheck(
          user,
          session,
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

      return reference;
      // biome-ignore lint/suspicious/noExplicitAny: OpenAPI schema typing from better-auth
    }) as Promise<any>,
  // biome-ignore lint/suspicious/noExplicitAny: OpenAPI schema typing from better-auth
  components: getSchema().then(({ components }) => components) as Promise<any>,
} as const;
