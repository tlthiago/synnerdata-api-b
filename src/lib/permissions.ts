import { createAccessControl } from "better-auth/plugins/access";
import { adminAc, defaultStatements } from "better-auth/plugins/admin/access";
import type { Role } from "@/db/schema";

export const systemStatements = {
  ...defaultStatements,
  plan: ["create", "read", "update", "delete", "sync"],
} as const;

export const systemAc = createAccessControl(systemStatements);

export const systemRoles = {
  super_admin: systemAc.newRole({
    ...adminAc.statements,
    plan: ["create", "read", "update", "delete", "sync"],
  }),
  admin: systemAc.newRole({
    ...adminAc.statements,
    plan: ["create", "read", "update", "delete", "sync"],
  }),
  user: systemAc.newRole({
    plan: ["read"],
  }),
};

export const orgStatements = {
  organization: ["read", "update", "delete"],
  branch: ["create", "read", "update", "delete"],
  sector: ["create", "read", "update", "delete"],
  costCenter: ["create", "read", "update", "delete"],
  jobClassification: ["create", "read", "update", "delete"],
  jobPosition: ["create", "read", "update", "delete"],
  ppeItem: ["create", "read", "update", "delete"],
  ppeDelivery: ["create", "read", "update", "delete"],
  laborLawsuit: ["create", "read", "update", "delete"],
  project: ["create", "read", "update", "delete"],
  employee: ["create", "read", "update", "delete"],
  absence: ["create", "read", "update", "delete"],
  accident: ["create", "read", "update", "delete"],
  medicalCertificate: ["create", "read", "update", "delete"],
  cpfAnalysis: ["create", "read", "update", "delete"],
  vacation: ["create", "read", "update", "delete"],
  warning: ["create", "read", "update", "delete"],
  promotion: ["create", "read", "update", "delete"],
  termination: ["create", "read", "update", "delete"],
  member: ["create", "read", "update", "delete"],
  invitation: ["create", "read", "cancel"],
  subscription: ["read", "update"],
  billing: ["read", "update"],
  billingProfile: ["create", "read", "update"],
  report: ["read", "export"],
  audit: ["read"],
} as const;

export type OrgPermissions = Partial<{
  [K in keyof typeof orgStatements]: (typeof orgStatements)[K][number][];
}>;

export const orgAc = createAccessControl(orgStatements);

type OrgRolePermissions = {
  [K in keyof typeof orgStatements]: (typeof orgStatements)[K][number][];
};

function inheritRole(
  base: OrgRolePermissions,
  overrides: Partial<OrgRolePermissions>
): OrgRolePermissions {
  return { ...base, ...overrides };
}

const ownerPerms: OrgRolePermissions = {
  organization: ["read", "update", "delete"],
  branch: ["create", "read", "update", "delete"],
  sector: ["create", "read", "update", "delete"],
  costCenter: ["create", "read", "update", "delete"],
  jobClassification: ["create", "read", "update", "delete"],
  jobPosition: ["create", "read", "update", "delete"],
  ppeItem: ["create", "read", "update", "delete"],
  ppeDelivery: ["create", "read", "update", "delete"],
  laborLawsuit: ["create", "read", "update", "delete"],
  project: ["create", "read", "update", "delete"],
  employee: ["create", "read", "update", "delete"],
  absence: ["create", "read", "update", "delete"],
  accident: ["create", "read", "update", "delete"],
  medicalCertificate: ["create", "read", "update", "delete"],
  cpfAnalysis: ["create", "read", "update", "delete"],
  vacation: ["create", "read", "update", "delete"],
  warning: ["create", "read", "update", "delete"],
  promotion: ["create", "read", "update", "delete"],
  termination: ["create", "read", "update", "delete"],
  member: ["create", "read", "update", "delete"],
  invitation: ["create", "read", "cancel"],
  subscription: ["read", "update"],
  billing: ["read", "update"],
  billingProfile: ["create", "read", "update"],
  report: ["read", "export"],
  audit: ["read"],
};

const managerPerms = inheritRole(ownerPerms, {
  organization: ["read", "update"],
  member: ["create", "read"],
  subscription: ["read"],
  billing: [],
  billingProfile: [],
  audit: [],
});

const supervisorPerms = inheritRole(ownerPerms, {
  organization: ["read"],
  branch: ["read"],
  sector: ["read"],
  costCenter: ["read"],
  jobClassification: ["read"],
  jobPosition: ["read"],
  ppeItem: ["read"],
  laborLawsuit: ["create", "read", "update"],
  project: ["read"],
  employee: ["create", "read", "update"],
  member: ["read"],
  invitation: ["read"],
  subscription: ["read"],
  billing: [],
  billingProfile: [],
  audit: [],
});

const viewerPerms = inheritRole(ownerPerms, {
  organization: ["read"],
  branch: ["read"],
  sector: ["read"],
  costCenter: ["read"],
  jobClassification: ["read"],
  jobPosition: ["read"],
  ppeItem: ["read"],
  ppeDelivery: ["read"],
  laborLawsuit: ["read"],
  project: ["read"],
  employee: ["read"],
  absence: ["read"],
  accident: ["read"],
  medicalCertificate: ["read"],
  cpfAnalysis: ["read"],
  vacation: ["read"],
  warning: ["read"],
  promotion: ["read"],
  termination: ["read"],
  member: ["read"],
  invitation: ["read"],
  subscription: ["read"],
  billing: [],
  billingProfile: [],
  report: ["read"],
  audit: [],
});

export const orgRoles: Record<Role, ReturnType<typeof orgAc.newRole>> = {
  owner: orgAc.newRole(ownerPerms),
  manager: orgAc.newRole(managerPerms),
  supervisor: orgAc.newRole(supervisorPerms),
  viewer: orgAc.newRole(viewerPerms),
};

export const apiKeyStatements = {
  employees: ["read"],
  occurrences: ["read"],
  organizations: ["read"],
  reports: ["read"],
} as const;

export type ApiKeyPermissions = Partial<{
  [K in keyof typeof apiKeyStatements]: (typeof apiKeyStatements)[K][number][];
}>;

export const DEFAULT_API_KEY_PERMISSIONS: ApiKeyPermissions = {
  employees: ["read"],
  occurrences: ["read"],
  organizations: ["read"],
  reports: ["read"],
};
