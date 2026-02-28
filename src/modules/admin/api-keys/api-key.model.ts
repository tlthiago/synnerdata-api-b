import { z } from "zod";
import { successResponseSchema } from "@/lib/responses/response.types";

export const apiKeyPermissionsSchema = z.object({
  employees: z.array(z.literal("read")).optional(),
  occurrences: z.array(z.literal("read")).optional(),
  organizations: z.array(z.literal("read")).optional(),
  reports: z.array(z.literal("read")).optional(),
});

export type ApiKeyPermissionsInput = z.infer<typeof apiKeyPermissionsSchema>;

export const createApiKeySchema = z.object({
  name: z.string().min(1).max(100),
  organizationId: z.string().optional(),
  permissions: apiKeyPermissionsSchema.optional(),
  expiresInDays: z.number().int().min(1).max(365).optional(),
});

export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;

export const listApiKeysQuerySchema = z.object({
  organizationId: z.string().optional(),
});

export type ListApiKeysQuery = z.infer<typeof listApiKeysQuerySchema>;

export const idParamSchema = z.object({
  id: z.string().min(1).describe("ID da API Key"),
});

export const apiKeyDataSchema = z.object({
  id: z.string(),
  name: z.string(),
  prefix: z.string(),
  enabled: z.boolean(),
  organizationId: z.string().nullable(),
  isGlobal: z.boolean(),
  permissions: apiKeyPermissionsSchema.nullable(),
  expiresAt: z.iso.datetime().nullable(),
  lastUsedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});

export type ApiKeyData = z.infer<typeof apiKeyDataSchema>;

export const apiKeyCreatedDataSchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  prefix: z.string(),
  expiresAt: z.iso.datetime().nullable(),
});

export type ApiKeyCreatedData = z.infer<typeof apiKeyCreatedDataSchema>;

export const createApiKeyResponseSchema = successResponseSchema(
  apiKeyCreatedDataSchema
);

export const listApiKeysResponseSchema = successResponseSchema(
  z.object({
    keys: z.array(apiKeyDataSchema),
  })
);

export const getApiKeyResponseSchema = successResponseSchema(apiKeyDataSchema);

export const revokeApiKeyResponseSchema = successResponseSchema(
  z.object({
    revoked: z.literal(true),
  })
);

export const deleteApiKeyResponseSchema = successResponseSchema(
  z.object({
    deleted: z.literal(true),
  })
);

export type CreateApiKeyResponse = z.infer<typeof createApiKeyResponseSchema>;
export type ListApiKeysResponse = z.infer<typeof listApiKeysResponseSchema>;
export type GetApiKeyResponse = z.infer<typeof getApiKeyResponseSchema>;
export type RevokeApiKeyResponse = z.infer<typeof revokeApiKeyResponseSchema>;
export type DeleteApiKeyResponse = z.infer<typeof deleteApiKeyResponseSchema>;

// Data-only types for service layer
export type CreateApiKeyData = ApiKeyCreatedData;
export type ListApiKeysData = { keys: ApiKeyData[] };
export type GetApiKeyData = ApiKeyData;
export type RevokeApiKeyData = { revoked: true };
export type DeleteApiKeyData = { deleted: true };
