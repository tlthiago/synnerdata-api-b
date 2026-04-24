import type {
  AuditAction,
  AuditLogEntry,
  AuditResource,
} from "@/modules/audit/audit.model";
import { AuditService } from "@/modules/audit/audit.service";

type AuditEntryParams = {
  action: AuditAction;
  resource: AuditResource;
  resourceId: string;
  userId: string;
  organizationId?: string | null;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
};

export function buildAuditEntry(params: AuditEntryParams): AuditLogEntry {
  const hasChanges = params.before !== undefined || params.after !== undefined;
  return {
    action: params.action,
    resource: params.resource,
    resourceId: params.resourceId,
    userId: params.userId,
    organizationId: params.organizationId,
    changes: hasChanges
      ? { before: params.before, after: params.after }
      : undefined,
  };
}

export async function auditUserCreate(user: {
  id: string;
  email: string;
}): Promise<void> {
  await AuditService.log(
    buildAuditEntry({
      action: "create",
      resource: "user",
      resourceId: user.id,
      userId: user.id,
      after: { id: user.id, email: user.email },
    })
  );
}

export async function auditUserDelete(user: {
  id: string;
  email: string;
}): Promise<void> {
  await AuditService.log(
    buildAuditEntry({
      action: "delete",
      resource: "user",
      resourceId: user.id,
      userId: user.id,
      before: { id: user.id, email: user.email },
    })
  );
}

export async function auditLogin(session: {
  id: string;
  userId: string;
  activeOrganizationId?: string | null;
}): Promise<void> {
  await AuditService.log(
    buildAuditEntry({
      action: "login",
      resource: "session",
      resourceId: session.id,
      userId: session.userId,
      organizationId: session.activeOrganizationId ?? null,
    })
  );
}

export async function auditOrganizationCreate(
  org: { id: string; name: string },
  userId: string
): Promise<void> {
  await AuditService.log(
    buildAuditEntry({
      action: "create",
      resource: "organization",
      resourceId: org.id,
      userId,
      organizationId: org.id,
      after: { id: org.id, name: org.name },
    })
  );
}

export async function auditOrganizationUpdate(
  org: { id: string; name: string },
  userId: string
): Promise<void> {
  // Better Auth's afterUpdateOrganization hook does not provide the pre-update
  // state — only `after` is recorded. To produce a diff, BA would need to
  // expose beforeUpdateOrganization or pass previousOrganization alongside.
  await AuditService.log(
    buildAuditEntry({
      action: "update",
      resource: "organization",
      resourceId: org.id,
      userId,
      organizationId: org.id,
      after: { id: org.id, name: org.name },
    })
  );
}

export async function auditOrganizationDelete(
  org: { id: string; name: string },
  userId: string
): Promise<void> {
  await AuditService.log(
    buildAuditEntry({
      action: "delete",
      resource: "organization",
      resourceId: org.id,
      userId,
      organizationId: org.id,
      before: { id: org.id, name: org.name },
    })
  );
}

export async function auditMemberAdd(
  member: { id: string; userId: string; role: string },
  organizationId: string,
  addedByUserId: string
): Promise<void> {
  await AuditService.log(
    buildAuditEntry({
      action: "create",
      resource: "member",
      resourceId: member.id,
      userId: addedByUserId,
      organizationId,
      after: { id: member.id, userId: member.userId, role: member.role },
    })
  );
}

export async function auditMemberRemove(
  member: { id: string; userId: string; role: string },
  organizationId: string,
  removedByUserId: string
): Promise<void> {
  await AuditService.log(
    buildAuditEntry({
      action: "delete",
      resource: "member",
      resourceId: member.id,
      userId: removedByUserId,
      organizationId,
      before: { id: member.id, userId: member.userId, role: member.role },
    })
  );
}

export async function auditMemberRoleUpdate(params: {
  member: { id: string; userId: string };
  previousRole: string;
  newRole: string;
  organizationId: string;
  updatedByUserId: string;
}): Promise<void> {
  await AuditService.log(
    buildAuditEntry({
      action: "update",
      resource: "member",
      resourceId: params.member.id,
      userId: params.updatedByUserId,
      organizationId: params.organizationId,
      before: { role: params.previousRole },
      after: { role: params.newRole },
    })
  );
}

export async function auditInvitationAccept(
  invitation: { id: string; email: string; role: string },
  member: { id: string; userId: string },
  organizationId: string
): Promise<void> {
  await AuditService.log(
    buildAuditEntry({
      action: "accept",
      resource: "invitation",
      resourceId: invitation.id,
      userId: member.userId,
      organizationId,
      after: {
        invitationId: invitation.id,
        email: invitation.email,
        role: invitation.role,
        memberId: member.id,
      },
    })
  );
}
