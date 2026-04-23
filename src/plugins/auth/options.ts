import type { OrgPermissions } from "@/lib/permissions";

export type AuthOptions =
  | true
  | {
      permissions?: OrgPermissions;
      requireOrganization?: boolean;
      requireAdmin?: boolean;
      requireSuperAdmin?: boolean;
      requireActiveSubscription?: boolean;
      requireFeature?: string;
      requireFeatures?: string[];
      allowAdminBypass?: boolean;
    };

export type ParsedAuthOptions = {
  permissions?: OrgPermissions;
  requireOrganization: boolean;
  requireAdmin: boolean;
  requireSuperAdmin: boolean;
  requireActiveSubscription: boolean;
  requireFeature?: string;
  requireFeatures?: string[];
  allowAdminBypass: boolean;
};

export function parseOptions(options: AuthOptions): ParsedAuthOptions | null {
  if (typeof options !== "object") {
    return null;
  }
  return {
    permissions: options.permissions,
    requireOrganization: options.requireOrganization ?? false,
    requireAdmin: options.requireAdmin ?? false,
    requireSuperAdmin: options.requireSuperAdmin ?? false,
    requireActiveSubscription: options.requireActiveSubscription ?? false,
    requireFeature: options.requireFeature,
    requireFeatures: options.requireFeatures,
    allowAdminBypass: options.allowAdminBypass ?? true,
  };
}

export function needsSubscriptionValidation(
  options: ParsedAuthOptions
): boolean {
  return (
    options.requireActiveSubscription ||
    !!options.requireFeature ||
    (options.requireFeatures !== undefined &&
      options.requireFeatures.length > 0)
  );
}
