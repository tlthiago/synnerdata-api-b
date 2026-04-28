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
  total: z.number().int().nonnegative(),
  limit: z.number().int().nonnegative(),
  offset: z.number().int().nonnegative(),
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
// ERROR RESPONSE SCHEMAS
// ============================================================

/**
 * Cria um schema Zod para resposta de erro com `code` literal.
 * Passe `detailsSchema` para incluir o campo `details` (obrigatório ou opcional
 * conforme o próprio schema).
 */
export function errorSchema<C extends string>(
  code: C,
  detailsSchema?: z.ZodTypeAny
) {
  const errorShape = detailsSchema
    ? { code: z.literal(code), message: z.string(), details: detailsSchema }
    : { code: z.literal(code), message: z.string() };
  return z.object({
    success: z.literal(false),
    error: z.object(errorShape),
  });
}

export const validationErrorSchema = errorSchema(
  "VALIDATION_ERROR",
  z.array(
    z.object({
      path: z.string().describe("Field path that failed validation"),
      message: z.string().describe("Validation error message"),
    })
  )
);

export const unauthorizedErrorSchema = errorSchema("UNAUTHORIZED");
export const forbiddenErrorSchema = errorSchema("FORBIDDEN");
export const notFoundErrorSchema = errorSchema("NOT_FOUND");
export const internalErrorSchema = errorSchema("INTERNAL_ERROR");
export const conflictErrorSchema = errorSchema(
  "CONFLICT",
  z.unknown().optional()
);

/**
 * Schema para erros 400 cujo `code` varia (ex.: regras de negócio específicas).
 * Mantido fora do factory `errorSchema` porque o contrato da factory assume
 * `code` literal — aqui `code` é `z.string()` genérico.
 */
export const badRequestErrorSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
