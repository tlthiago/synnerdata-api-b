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
    };

type ParsedAuthOptions = {
  permissions?: OrgPermissions;
  requireOrganization: boolean;
  requireAdmin: boolean;
  requireSuperAdmin: boolean;
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
      async resolve({ request: { headers } }) {
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

        await validatePermissions(headers, session, parsed);
        validateRoleRequirements(user.role, parsed);

        return { user, session };
      },
    }),
  });

let _schema: ReturnType<typeof auth.api.generateOpenAPISchema>;
// biome-ignore lint/suspicious/noAssignInExpressions: memoization pattern from better-auth docs
const getSchema = async () => (_schema ??= auth.api.generateOpenAPISchema());

export const OpenAPI = {
  getPaths: (prefix = "/auth/api") =>
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
