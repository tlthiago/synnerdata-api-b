import { Elysia } from "elysia";
import { auth } from "./auth";

type PermissionMap = Record<string, string[]>;

export class ForbiddenError extends Error {
  status = 403;
  code = "FORBIDDEN";

  constructor(message = "You don't have permission to perform this action") {
    super(message);
    this.name = "ForbiddenError";
  }

  toResponse() {
    return {
      error: this.message,
      code: this.code,
    };
  }
}

export const betterAuthPlugin = new Elysia({ name: "better-auth" })
  .error({ ForbiddenError })
  .onError(({ error, set }) => {
    if (error instanceof ForbiddenError) {
      set.status = error.status;
      return error.toResponse();
    }
  })
  .mount(auth.handler)
  .macro({
    auth: {
      async resolve({ status, request: { headers } }) {
        const session = await auth.api.getSession({ headers });
        if (!session) {
          return status(401, { message: "Unauthorized" });
        }
        return {
          user: session.user,
          session: session.session,
        };
      },
    },
  })
  .derive({ as: "scoped" }, ({ request: { headers } }) => ({
    /**
     * Check if the current user has the specified permissions.
     * Uses Better Auth's Access Control system.
     *
     * @example
     * const canCreate = await hasPermission({ employee: ["create"] });
     * const canManage = await hasPermission({ employee: ["create", "update", "delete"] });
     */
    hasPermission: async (permissions: PermissionMap): Promise<boolean> => {
      try {
        const result = await auth.api.hasPermission({
          headers,
          body: { permissions },
        });
        return result?.success ?? false;
      } catch {
        return false;
      }
    },

    /**
     * Require the current user to have the specified permissions.
     * Throws ForbiddenError if the user doesn't have the required permissions.
     *
     * @example
     * await requirePermission({ subscription: ["update"] });
     */
    requirePermission: async (
      permissions: PermissionMap,
      errorMessage?: string
    ): Promise<void> => {
      try {
        const result = await auth.api.hasPermission({
          headers,
          body: { permissions },
        });
        if (!result?.success) {
          throw new ForbiddenError(errorMessage);
        }
      } catch (error) {
        if (error instanceof ForbiddenError) {
          throw error;
        }
        throw new ForbiddenError(errorMessage);
      }
    },
  }));

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
