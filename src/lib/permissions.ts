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
  employee: ["create", "read", "update", "delete"],
  occurrence: ["create", "read", "update", "delete"],
  member: ["create", "read", "update", "delete"],
  invitation: ["create", "read", "cancel"],
  subscription: ["read", "update"],
  billing: ["read", "update"],
  report: ["read", "export"],
  audit: ["read"],
} as const;

export type OrgPermissions = Partial<{
  [K in keyof typeof orgStatements]: (typeof orgStatements)[K][number][];
}>;

export const orgAc = createAccessControl(orgStatements);

export const orgRoles: Record<Role, ReturnType<typeof orgAc.newRole>> = {
  owner: orgAc.newRole({
    organization: ["read", "update", "delete"],
    branch: ["create", "read", "update", "delete"],
    employee: ["create", "read", "update", "delete"],
    occurrence: ["create", "read", "update", "delete"],
    member: ["create", "read", "update", "delete"],
    invitation: ["create", "read", "cancel"],
    subscription: ["read", "update"],
    billing: ["read", "update"],
    report: ["read", "export"],
    audit: ["read"],
  }),
  manager: orgAc.newRole({
    organization: ["read"],
    branch: ["create", "read", "update", "delete"],
    employee: ["create", "read", "update", "delete"],
    occurrence: ["create", "read", "update", "delete"],
    member: ["create", "read"],
    invitation: ["create", "read"],
    subscription: ["read"],
    billing: [],
    report: ["read", "export"],
    audit: [],
  }),
  supervisor: orgAc.newRole({
    organization: ["read"],
    branch: ["read"],
    employee: ["read"],
    occurrence: ["create", "read", "update", "delete"],
    member: ["read"],
    invitation: ["read"],
    subscription: ["read"],
    billing: [],
    report: ["read", "export"],
    audit: [],
  }),
  viewer: orgAc.newRole({
    organization: ["read"],
    branch: ["read"],
    employee: ["read"],
    occurrence: ["read"],
    member: ["read"],
    invitation: ["read"],
    subscription: ["read"],
    billing: [],
    report: ["read"],
    audit: [],
  }),
};

export const ac = orgAc;
export const roles = orgRoles;
export const statements = orgStatements;
export type Permissions = OrgPermissions;

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
