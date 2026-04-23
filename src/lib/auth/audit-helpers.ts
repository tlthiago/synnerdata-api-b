import { AuditService } from "@/modules/audit/audit.service";

export async function auditUserCreate(user: {
  id: string;
  email: string;
}): Promise<void> {
  await AuditService.log({
    action: "create",
    resource: "user",
    resourceId: user.id,
    userId: user.id,
    changes: { after: { id: user.id, email: user.email } },
  });
}

export async function auditUserDelete(user: {
  id: string;
  email: string;
}): Promise<void> {
  await AuditService.log({
    action: "delete",
    resource: "user",
    resourceId: user.id,
    userId: user.id,
    changes: { before: { id: user.id, email: user.email } },
  });
}

export async function auditLogin(session: {
  id: string;
  userId: string;
  activeOrganizationId?: string | null;
}): Promise<void> {
  await AuditService.log({
    action: "login",
    resource: "session",
    resourceId: session.id,
    userId: session.userId,
    organizationId: session.activeOrganizationId ?? null,
  });
}

export async function auditOrganizationCreate(
  org: { id: string; name: string },
  userId: string
): Promise<void> {
  await AuditService.log({
    action: "create",
    resource: "organization",
    resourceId: org.id,
    userId,
    organizationId: org.id,
    changes: { after: { id: org.id, name: org.name } },
  });
}

export async function auditOrganizationUpdate(
  org: { id: string; name: string },
  userId: string
): Promise<void> {
  await AuditService.log({
    action: "update",
    resource: "organization",
    resourceId: org.id,
    userId,
    organizationId: org.id,
    changes: { after: { id: org.id, name: org.name } },
  });
}

export async function auditOrganizationDelete(
  org: { id: string; name: string },
  userId: string
): Promise<void> {
  await AuditService.log({
    action: "delete",
    resource: "organization",
    resourceId: org.id,
    userId,
    organizationId: org.id,
    changes: { before: { id: org.id, name: org.name } },
  });
}

export async function auditMemberAdd(
  member: { id: string; userId: string; role: string },
  organizationId: string,
  addedByUserId: string
): Promise<void> {
  await AuditService.log({
    action: "create",
    resource: "member",
    resourceId: member.id,
    userId: addedByUserId,
    organizationId,
    changes: {
      after: {
        id: member.id,
        userId: member.userId,
        role: member.role,
      },
    },
  });
}

export async function auditMemberRemove(
  member: { id: string; userId: string; role: string },
  organizationId: string,
  removedByUserId: string
): Promise<void> {
  await AuditService.log({
    action: "delete",
    resource: "member",
    resourceId: member.id,
    userId: removedByUserId,
    organizationId,
    changes: {
      before: {
        id: member.id,
        userId: member.userId,
        role: member.role,
      },
    },
  });
}

export async function auditMemberRoleUpdate(params: {
  member: { id: string; userId: string };
  previousRole: string;
  newRole: string;
  organizationId: string;
  updatedByUserId: string;
}): Promise<void> {
  await AuditService.log({
    action: "update",
    resource: "member",
    resourceId: params.member.id,
    userId: params.updatedByUserId,
    organizationId: params.organizationId,
    changes: {
      before: { role: params.previousRole },
      after: { role: params.newRole },
    },
  });
}

export async function auditInvitationAccept(
  invitation: { id: string; email: string; role: string },
  member: { id: string; userId: string },
  organizationId: string
): Promise<void> {
  await AuditService.log({
    action: "accept",
    resource: "invitation",
    resourceId: invitation.id,
    userId: member.userId,
    organizationId,
    changes: {
      after: {
        invitationId: invitation.id,
        email: invitation.email,
        role: invitation.role,
        memberId: member.id,
      },
    },
  });
}
