import { auth } from "@/lib/auth";

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
