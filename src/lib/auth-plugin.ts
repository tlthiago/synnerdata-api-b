import { Elysia } from "elysia";
import { auth } from "./auth";

export const betterAuthPlugin = new Elysia({ name: "better-auth" })
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
