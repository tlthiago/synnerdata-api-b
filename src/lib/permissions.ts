import { createAccessControl } from "better-auth/plugins/access";

/**
 * Statement defining all resources and their available actions
 */
const statement = {
  organization: ["read", "update", "delete"],
  employee: ["create", "read", "update", "delete"],
  occurrence: ["create", "read", "update", "delete"],
  member: ["create", "read", "update", "delete"],
  invitation: ["create", "read", "cancel"],
  subscription: ["read", "update"],
  report: ["read", "export"],
} as const;

/**
 * Access Control instance
 */
export const ac = createAccessControl(statement);

/**
 * Owner - Full control over the organization
 * Assigned to the user who creates the organization
 */
export const owner = ac.newRole({
  organization: ["read", "update", "delete"],
  employee: ["create", "read", "update", "delete"],
  occurrence: ["create", "read", "update", "delete"],
  member: ["create", "read", "update", "delete"],
  invitation: ["create", "read", "cancel"],
  subscription: ["read", "update"],
  report: ["read", "export"],
});

/**
 * Manager - Manages employees, occurrences and can invite members
 * Cannot update organization data or manage existing members
 */
export const manager = ac.newRole({
  organization: ["read"],
  employee: ["create", "read", "update", "delete"],
  occurrence: ["create", "read", "update", "delete"],
  member: ["create", "read"],
  invitation: ["create", "read"],
  subscription: ["read"],
  report: ["read", "export"],
});

/**
 * Supervisor - Manages occurrences only
 * Note: update/delete restricted to own occurrences (enforced at service layer)
 */
export const supervisor = ac.newRole({
  organization: ["read"],
  employee: ["read"],
  occurrence: ["create", "read", "update", "delete"],
  member: ["read"],
  invitation: ["read"],
  report: ["read", "export"],
});

/**
 * Viewer - Read-only access
 */
export const viewer = ac.newRole({
  organization: ["read"],
  employee: ["read"],
  occurrence: ["read"],
  member: ["read"],
  invitation: ["read"],
  report: ["read"],
});
