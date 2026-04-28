import { APIError } from "better-auth/api";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { type Role, roleValues, schema } from "@/db/schema";

export async function validateUniqueRole(
  role: string,
  organizationId: string
): Promise<void> {
  const validRoles: readonly string[] = roleValues;
  if (!validRoles.includes(role)) {
    return;
  }

  const typedRole = role as Role;

  const existingMember = await db.query.members.findFirst({
    where: and(
      eq(schema.members.organizationId, organizationId),
      eq(schema.members.role, typedRole)
    ),
  });

  if (existingMember) {
    throw new APIError("BAD_REQUEST", {
      code: "ROLE_ALREADY_ASSIGNED",
      message: `A role "${role}" já está atribuída a um membro desta organização.`,
    });
  }

  const pendingInvitation = await db.query.invitations.findFirst({
    where: and(
      eq(schema.invitations.organizationId, organizationId),
      eq(schema.invitations.role, typedRole),
      eq(schema.invitations.status, "pending")
    ),
  });

  if (pendingInvitation) {
    throw new APIError("BAD_REQUEST", {
      code: "ROLE_INVITATION_PENDING",
      message: `Já existe um convite pendente para a role "${role}" nesta organização.`,
    });
  }
}
