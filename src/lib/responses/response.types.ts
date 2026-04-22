import { z } from "zod";

/** Metadados de paginação */
export type PaginationMeta = {
  total: number;
  limit: number;
  offset: number;
};

/** Resposta de sucesso simples */
export type SuccessResponse<T> = {
  success: true;
  data: T;
  message?: string;
};

/** Resposta de sucesso paginada */
export type PaginatedResponse<T> = {
  success: true;
  data: T[];
  pagination: PaginationMeta;
  message?: string;
};

/** Schema Zod para metadados de paginação */
export const paginationMetaSchema = z.object({
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
});

/** Cria um schema Zod para resposta de sucesso com envelope */
export function successResponseSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.object({
    success: z.literal(true),
    data: dataSchema,
    message: z.string().optional(),
  });
}

/** Schema Zod para resposta de sucesso apenas com mensagem (sem data) */
export const messageOnlyResponseSchema = z.object({
  success: z.literal(true),
  message: z.string(),
});

/** Cria um schema Zod para resposta paginada com envelope */
export function paginatedResponseSchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.object({
    success: z.literal(true),
    data: z.array(itemSchema),
    pagination: paginationMetaSchema,
    message: z.string().optional(),
  });
}

// ============================================================
// AUDIT USER PRIMITIVES
// ============================================================

/** Schema Zod para o usuário exposto em campos de auditoria (`createdBy`, `updatedBy`, `deletedBy`). */
export const auditUserSchema = z
  .object({
    id: z.string().describe("User ID"),
    name: z.string().describe("User display name"),
  })
  .nullable()
  .describe(
    "User who performed the action (null when system-originated or user removed)"
  );

export type AuditUser = z.infer<typeof auditUserSchema>;

/**
 * Reshape de resultado Drizzle Relational API para o payload da API:
 * descarta as colunas textuais `createdBy` / `updatedBy` / `deletedBy` e
 * promove as relações `*User` para essas mesmas chaves como `AuditUser`.
 */
export function mapAuditRelations<
  T extends {
    createdBy: string | null;
    updatedBy: string | null;
    deletedBy: string | null;
    createdByUser: AuditUser;
    updatedByUser: AuditUser;
    deletedByUser: AuditUser;
  },
>(raw: T) {
  const {
    createdByUser,
    updatedByUser,
    deletedByUser,
    createdBy: _createdBy,
    updatedBy: _updatedBy,
    deletedBy: _deletedBy,
    ...rest
  } = raw;
  return {
    ...rest,
    createdBy: createdByUser,
    updatedBy: updatedByUser,
    deletedBy: deletedByUser,
  };
}

// ============================================================
// ERROR RESPONSE SCHEMAS
// ============================================================

/** Schema base para resposta de erro */
export const errorResponseSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string().describe("Error code identifier"),
    message: z.string().describe("Human-readable error message"),
    details: z.unknown().optional().describe("Additional error details"),
  }),
});

/** Schema para erro de validação (400) */
export const validationErrorSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.literal("VALIDATION_ERROR"),
    message: z.string(),
    details: z.array(
      z.object({
        path: z.string().describe("Field path that failed validation"),
        message: z.string().describe("Validation error message"),
      })
    ),
  }),
});

/** Schema para erro de autenticação (401) */
export const unauthorizedErrorSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.literal("UNAUTHORIZED"),
    message: z.string(),
  }),
});

/** Schema para erro de permissão (403) */
export const forbiddenErrorSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.literal("FORBIDDEN"),
    message: z.string(),
  }),
});

/** Schema para erro de recurso não encontrado (404) */
export const notFoundErrorSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.literal("NOT_FOUND"),
    message: z.string(),
  }),
});

/** Schema para erro interno (500) */
export const internalErrorSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.literal("INTERNAL_ERROR"),
    message: z.string(),
  }),
});

/** Schema para erro de conflito (409) */
export const conflictErrorSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.literal("CONFLICT"),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});

/** Schema para erro de requisição inválida (400) */
export const badRequestErrorSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
