import { auth } from "@/lib/auth";
import type { ApiKeyPermissions } from "@/lib/permissions";

export type TestApiKey = {
  id: string;
  key: string;
  name: string;
  prefix: string;
};

type CreateTestApiKeyOptions = {
  userId: string;
  organizationId?: string;
  name?: string;
  permissions?: ApiKeyPermissions;
  expiresInDays?: number;
};

export async function createTestApiKey(
  options: CreateTestApiKeyOptions
): Promise<TestApiKey> {
  const name = options.name ?? `test-api-key-${Date.now()}`;

  const result = await auth.api.createApiKey({
    body: {
      name,
      userId: options.userId,
      permissions: options.permissions ?? {
        employees: ["read"],
        occurrences: ["read"],
        organizations: ["read"],
        reports: ["read"],
      },
      metadata: {
        organizationId: options.organizationId ?? null,
        isGlobal: !options.organizationId,
        createdBy: options.userId,
      },
      expiresIn: options.expiresInDays
        ? options.expiresInDays * 24 * 60 * 60
        : undefined,
      rateLimitEnabled: true,
      rateLimitMax: 100,
      rateLimitTimeWindow: 60 * 1000,
    },
  });

  return {
    id: result.id,
    key: result.key,
    name: result.name ?? name,
    prefix: result.start ?? result.key.slice(0, 12),
  };
}

export function createApiKeyHeaders(apiKey: string): Record<string, string> {
  return {
    "x-api-key": apiKey,
    "Content-Type": "application/json",
  };
}

export function createBearerApiKeyHeaders(
  apiKey: string
): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

export function createGlobalTestApiKey(
  userId: string,
  name?: string
): Promise<TestApiKey> {
  return createTestApiKey({
    userId,
    name: name ?? `global-api-key-${Date.now()}`,
  });
}

export function createOrgScopedTestApiKey(
  userId: string,
  organizationId: string,
  name?: string
): Promise<TestApiKey> {
  return createTestApiKey({
    userId,
    organizationId,
    name: name ?? `org-api-key-${Date.now()}`,
  });
}
