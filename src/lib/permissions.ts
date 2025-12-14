import { createAccessControl } from "better-auth/plugins/access";
import { adminAc, defaultStatements } from "better-auth/plugins/admin/access";
import type { Role } from "@/db/schema";

// ============================================================
// SYSTEM-LEVEL ACCESS CONTROL (Admin Plugin)
// ============================================================

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
    plan: ["read"],
  }),
  user: systemAc.newRole({
    plan: ["read"],
  }),
};

// ============================================================
// ORGANIZATION-LEVEL ACCESS CONTROL (Organization Plugin)
// ============================================================

export const orgStatements = {
  organization: ["read", "update", "delete"],
  employee: ["create", "read", "update", "delete"],
  occurrence: ["create", "read", "update", "delete"],
  member: ["create", "read", "update", "delete"],
  invitation: ["create", "read", "cancel"],
  subscription: ["read", "update"],
  billing: ["read", "update"],
  report: ["read", "export"],
} as const;

export type OrgPermissions = Partial<{
  [K in keyof typeof orgStatements]: (typeof orgStatements)[K][number][];
}>;

export const orgAc = createAccessControl(orgStatements);

export const orgRoles: Record<Role, ReturnType<typeof orgAc.newRole>> = {
  owner: orgAc.newRole({
    organization: ["read", "update", "delete"],
    employee: ["create", "read", "update", "delete"],
    occurrence: ["create", "read", "update", "delete"],
    member: ["create", "read", "update", "delete"],
    invitation: ["create", "read", "cancel"],
    subscription: ["read", "update"],
    billing: ["read", "update"],
    report: ["read", "export"],
  }),
  manager: orgAc.newRole({
    organization: ["read"],
    employee: ["create", "read", "update", "delete"],
    occurrence: ["create", "read", "update", "delete"],
    member: ["create", "read"],
    invitation: ["create", "read"],
    subscription: ["read"],
    billing: [],
    report: ["read", "export"],
  }),
  supervisor: orgAc.newRole({
    organization: ["read"],
    employee: ["read"],
    occurrence: ["create", "read", "update", "delete"],
    member: ["read"],
    invitation: ["read"],
    subscription: ["read"],
    billing: [],
    report: ["read", "export"],
  }),
  viewer: orgAc.newRole({
    organization: ["read"],
    employee: ["read"],
    occurrence: ["read"],
    member: ["read"],
    invitation: ["read"],
    subscription: ["read"],
    billing: [],
    report: ["read"],
  }),
};

// ============================================================
// ALIASES (backward compatibility)
// ============================================================

export const ac = orgAc;
export const roles = orgRoles;
export const statements = orgStatements;
export type Permissions = OrgPermissions;
