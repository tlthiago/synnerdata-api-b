import { auth } from "@/lib/auth";
import { DEFAULT_API_KEY_PERMISSIONS } from "@/lib/auth/permissions";
import { AuditService } from "@/modules/audit/audit.service";
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

function extractAuditMetadata(headers: AuthHeaders | undefined): {
  ipAddress: string | null;
  userAgent: string | null;
} {
  if (!headers) {
    return { ipAddress: null, userAgent: null };
  }
  const getHeader = (name: string): string | null => {
    if (headers instanceof Headers) {
      return headers.get(name);
    }
    const value = headers[name] ?? headers[name.toLowerCase()];
    return value ?? null;
  };
  const forwarded = getHeader("x-forwarded-for");
  return {
    ipAddress:
      forwarded?.split(",")[0]?.trim() ?? getHeader("x-real-ip") ?? null,
    userAgent: getHeader("user-agent"),
  };
}

export abstract class ApiKeyService {
  static async create(
    createdByUserId: string,
    data: CreateApiKeyInput,
    headers?: AuthHeaders
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

    const prefix = result.start ?? result.key.slice(0, 12);
    const name = result.name ?? data.name;
    const metadata = extractAuditMetadata(headers);

    await AuditService.log({
      action: "create",
      resource: "api_key",
      resourceId: result.id,
      userId: createdByUserId,
      organizationId: data.organizationId ?? null,
      changes: {
        after: {
          prefix,
          name,
          organizationId: data.organizationId ?? null,
          isGlobal: !data.organizationId,
        },
      },
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return {
      id: result.id,
      key: result.key,
      name,
      prefix,
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

    return filtered.map((k) => {
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
    });
  }

  static getById(headers: AuthHeaders, keyId: string): Promise<GetApiKeyData> {
    return withApiKeyNotFoundFallback(keyId, async () => {
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
    });
  }

  static revoke(
    userId: string,
    headers: AuthHeaders,
    keyId: string
  ): Promise<RevokeApiKeyData> {
    return withApiKeyNotFoundFallback(keyId, async () => {
      await auth.api.updateApiKey({
        body: {
          keyId,
          enabled: false,
        },
        headers,
      });

      const metadata = extractAuditMetadata(headers);
      await AuditService.log({
        action: "update",
        resource: "api_key",
        resourceId: keyId,
        userId,
        changes: {
          before: { enabled: true },
          after: { enabled: false },
        },
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
      });

      return {
        revoked: true,
      };
    });
  }

  static delete(
    userId: string,
    headers: AuthHeaders,
    keyId: string
  ): Promise<DeleteApiKeyData> {
    return withApiKeyNotFoundFallback(keyId, async () => {
      await auth.api.deleteApiKey({
        body: { keyId },
        headers,
      });

      const metadata = extractAuditMetadata(headers);
      await AuditService.log({
        action: "delete",
        resource: "api_key",
        resourceId: keyId,
        userId,
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
      });

      return {
        deleted: true,
      };
    });
  }
}

function isBetterAuthNotFound(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.name === "APIError" &&
    (error as unknown as { statusCode: number }).statusCode === 404
  );
}

async function withApiKeyNotFoundFallback<T>(
  keyId: string,
  fn: () => Promise<T>
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (isBetterAuthNotFound(error)) {
      throw new ApiKeyNotFoundError(keyId);
    }
    throw error;
  }
}
