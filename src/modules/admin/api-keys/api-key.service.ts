import { auth } from "@/lib/auth";
import { DEFAULT_API_KEY_PERMISSIONS } from "@/lib/permissions";
import type {
  CreateApiKeyData,
  CreateApiKeyInput,
  DeleteApiKeyData,
  GetApiKeyData,
  ListApiKeysData,
  RevokeApiKeyData,
} from "./api-key.model";
import { ApiKeyNotFoundError } from "./errors";

type AuthHeaders = Headers | Record<string, string>;

export abstract class ApiKeyService {
  static async create(
    createdByUserId: string,
    data: CreateApiKeyInput
  ): Promise<CreateApiKeyData> {
    const result = await auth.api.createApiKey({
      body: {
        name: data.name,
        userId: createdByUserId,
        permissions: data.permissions ?? DEFAULT_API_KEY_PERMISSIONS,
        metadata: {
          organizationId: data.organizationId ?? null,
          createdBy: createdByUserId,
          isGlobal: !data.organizationId,
        },
        expiresIn: data.expiresInDays
          ? data.expiresInDays * 24 * 60 * 60
          : undefined,
        rateLimitEnabled: true,
        rateLimitMax: 100,
        rateLimitTimeWindow: 60 * 1000,
      },
    });

    return {
      id: result.id,
      key: result.key,
      name: result.name ?? data.name,
      prefix: result.start ?? result.key.slice(0, 12),
      expiresAt: result.expiresAt?.toISOString() ?? null,
    };
  }

  static async list(
    headers: AuthHeaders,
    organizationId?: string
  ): Promise<ListApiKeysData> {
    const result = await auth.api.listApiKeys({
      headers,
    });

    const keys = Array.isArray(result) ? result : [];

    const filtered = organizationId
      ? keys.filter(
          (k) =>
            (k.metadata as { organizationId?: string })?.organizationId ===
            organizationId
        )
      : keys;

    return {
      keys: filtered.map((k) => {
        const metadata = k.metadata as {
          organizationId?: string | null;
          isGlobal?: boolean;
        } | null;

        return {
          id: k.id,
          name: k.name ?? "Unnamed Key",
          prefix: k.start ?? "",
          enabled: k.enabled ?? true,
          organizationId: metadata?.organizationId ?? null,
          isGlobal: metadata?.isGlobal ?? false,
          permissions: k.permissions as {
            employees?: ["read"];
            occurrences?: ["read"];
            organizations?: ["read"];
            reports?: ["read"];
          } | null,
          expiresAt: k.expiresAt?.toISOString() ?? null,
          lastUsedAt: k.lastRequest?.toISOString() ?? null,
          createdAt: k.createdAt.toISOString(),
        };
      }),
    };
  }

  static async getById(
    headers: AuthHeaders,
    keyId: string
  ): Promise<GetApiKeyData> {
    try {
      const result = await auth.api.getApiKey({
        query: { id: keyId },
        headers,
      });

      if (!result) {
        throw new ApiKeyNotFoundError(keyId);
      }

      const metadata = result.metadata as {
        organizationId?: string | null;
        isGlobal?: boolean;
      } | null;

      return {
        id: result.id,
        name: result.name ?? "Unnamed Key",
        prefix: result.start ?? "",
        enabled: result.enabled ?? true,
        organizationId: metadata?.organizationId ?? null,
        isGlobal: metadata?.isGlobal ?? false,
        permissions: result.permissions as {
          employees?: ["read"];
          occurrences?: ["read"];
          organizations?: ["read"];
          reports?: ["read"];
        } | null,
        expiresAt: result.expiresAt?.toISOString() ?? null,
        lastUsedAt: result.lastRequest?.toISOString() ?? null,
        createdAt: result.createdAt.toISOString(),
      };
    } catch (error) {
      if (isBetterAuthNotFound(error)) {
        throw new ApiKeyNotFoundError(keyId);
      }
      throw error;
    }
  }

  static async revoke(
    headers: AuthHeaders,
    keyId: string
  ): Promise<RevokeApiKeyData> {
    try {
      await auth.api.updateApiKey({
        body: {
          keyId,
          enabled: false,
        },
        headers,
      });

      return {
        revoked: true,
      };
    } catch (error) {
      if (isBetterAuthNotFound(error)) {
        throw new ApiKeyNotFoundError(keyId);
      }
      throw error;
    }
  }

  static async delete(
    headers: AuthHeaders,
    keyId: string
  ): Promise<DeleteApiKeyData> {
    try {
      await auth.api.deleteApiKey({
        body: { keyId },
        headers,
      });

      return {
        deleted: true,
      };
    } catch (error) {
      if (isBetterAuthNotFound(error)) {
        throw new ApiKeyNotFoundError(keyId);
      }
      throw error;
    }
  }
}

function isBetterAuthNotFound(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.name === "APIError" &&
    (error as unknown as { statusCode: number }).statusCode === 404
  );
}
