import { createAccessControl } from "better-auth/plugins/access";
import type { Role } from "@/db/schema";

export const statements = {
  organization: ["read", "update", "delete"],
  employee: ["create", "read", "update", "delete"],
  occurrence: ["create", "read", "update", "delete"],
  member: ["create", "read", "update", "delete"],
  invitation: ["create", "read", "cancel"],
  subscription: ["read", "update"],
  report: ["read", "export"],
} as const;

export type Permissions = Partial<{
  [K in keyof typeof statements]: (typeof statements)[K][number][];
}>;

export const ac = createAccessControl(statements);

export const roles: Record<Role, ReturnType<typeof ac.newRole>> = {
  owner: ac.newRole({
    organization: ["read", "update", "delete"],
    employee: ["create", "read", "update", "delete"],
    occurrence: ["create", "read", "update", "delete"],
    member: ["create", "read", "update", "delete"],
    invitation: ["create", "read", "cancel"],
    subscription: ["read", "update"],
    report: ["read", "export"],
  }),

  manager: ac.newRole({
    organization: ["read"],
    employee: ["create", "read", "update", "delete"],
    occurrence: ["create", "read", "update", "delete"],
    member: ["create", "read"],
    invitation: ["create", "read"],
    subscription: ["read"],
    report: ["read", "export"],
  }),

  supervisor: ac.newRole({
    organization: ["read"],
    employee: ["read"],
    occurrence: ["create", "read", "update", "delete"],
    member: ["read"],
    invitation: ["read"],
    subscription: ["read"],
    report: ["read", "export"],
  }),

  viewer: ac.newRole({
    organization: ["read"],
    employee: ["read"],
    occurrence: ["read"],
    member: ["read"],
    invitation: ["read"],
    subscription: ["read"],
    report: ["read"],
  }),
};
