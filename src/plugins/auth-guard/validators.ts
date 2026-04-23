import { type AuthSession, type AuthUser, auth } from "@/lib/auth";
import { ForbiddenError } from "@/lib/errors/http-errors";
import {
  FeatureNotAvailableError,
  SubscriptionRequiredError,
} from "@/modules/payments/errors";
import { LimitsService } from "@/modules/payments/limits/limits.service";
import { SubscriptionService } from "@/modules/payments/subscription/subscription.service";
import {
  needsSubscriptionValidation,
  type ParsedAuthOptions,
} from "@/plugins/auth-guard/options";

export class NoActiveOrganizationError extends ForbiddenError {
  code = "NO_ACTIVE_ORGANIZATION";

  constructor() {
    super("No active organization selected");
  }
}

export class AdminRequiredError extends ForbiddenError {
  constructor() {
    super("Admin access required");
  }
}

export class SuperAdminRequiredError extends ForbiddenError {
  constructor() {
    super("Super admin access required");
  }
}

export function isSystemAdmin(role: string | null | undefined): boolean {
  return role === "admin" || role === "super_admin";
}

export function isSuperAdmin(role: string | null | undefined): boolean {
  return role === "super_admin";
}

export function isApiKeyRequest(headers: Headers): boolean {
  return !!headers.get("x-api-key");
}

export function extractClientIp(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() ?? null;
  }
  return headers.get("x-real-ip");
}

export function validateRoleRequirements(
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

export function canBypassSubscriptionCheck(
  user: AuthUser,
  headers: Headers,
  allowBypass: boolean
): boolean {
  if (!allowBypass) {
    return false;
  }
  return isSystemAdmin(user.role) || isApiKeyRequest(headers);
}

export async function resolveApiKeyOrgContext(
  headers: Headers
): Promise<string | null> {
  const apiKey = headers.get("x-api-key");
  if (!apiKey) {
    return null;
  }

  const result = await auth.api.verifyApiKey({
    body: { key: apiKey },
  });

  if (!(result.valid && result.key?.metadata)) {
    return null;
  }

  const metadata = result.key.metadata as { organizationId?: string | null };
  return metadata.organizationId ?? null;
}

export async function validateActiveSubscription(
  organizationId: string
): Promise<void> {
  const access = await SubscriptionService.checkAccess(organizationId);
  if (!access.hasAccess) {
    throw new SubscriptionRequiredError(access.status);
  }
}

export async function validateFeatureAccess(
  organizationId: string,
  featureName: string
): Promise<void> {
  const result = await LimitsService.checkFeature(organizationId, featureName);
  if (!result.hasAccess) {
    throw new FeatureNotAvailableError(
      result.featureDisplayName,
      result.requiredPlan ?? undefined
    );
  }
}

export async function validateSubscriptionAndFeatures(
  organizationId: string | null,
  options: ParsedAuthOptions,
  canBypass: boolean
): Promise<void> {
  if (canBypass) {
    return;
  }

  if (!organizationId) {
    if (needsSubscriptionValidation(options)) {
      throw new NoActiveOrganizationError();
    }
    return;
  }

  if (options.requireActiveSubscription) {
    await validateActiveSubscription(organizationId);
  }

  if (options.requireFeature) {
    await validateFeatureAccess(organizationId, options.requireFeature);
  }

  if (options.requireFeatures) {
    for (const feature of options.requireFeatures) {
      await validateFeatureAccess(organizationId, feature);
    }
  }
}

export async function validatePermissions(
  headers: Headers,
  session: AuthSession,
  options: ParsedAuthOptions
): Promise<void> {
  if (options.requireOrganization && !session.activeOrganizationId) {
    throw new NoActiveOrganizationError();
  }

  if (options.permissions) {
    if (isApiKeyRequest(headers)) {
      return;
    }

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
