import { APIError } from "better-auth/api";
import type {
  Invitation,
  Member,
  Organization,
} from "better-auth/plugins/organization";
import type { User } from "better-auth/types";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { roleValues, schema } from "@/db/schema";
import { env } from "@/env";
import { getAdminEmails } from "@/lib/auth/admin-helpers";
import {
  auditInvitationAccept,
  auditMemberAdd,
  auditMemberRemove,
  auditMemberRoleUpdate,
  auditOrganizationCreate,
  auditOrganizationDelete,
  auditOrganizationUpdate,
} from "@/lib/auth/audit-helpers";
import { validateUniqueRole } from "@/lib/auth/validators";
import {
  sendOrganizationInvitationEmail,
  sendPasswordResetEmail,
  sendProvisionActivationEmail,
} from "@/lib/email";
import { logger } from "@/lib/logger";
import { ErrorReporter } from "@/lib/sentry/reporter";
import { OrganizationService } from "@/modules/organizations/profile/organization.service";
import { SubscriptionService } from "@/modules/payments/subscription/subscription.service";

export async function sendPasswordResetForProvisionOrDefault({
  user,
  url,
}: {
  user: { id: string; email: string; name: string };
  url: string;
}): Promise<void> {
  const provision = await db.query.adminOrgProvisions.findFirst({
    where: and(
      eq(schema.adminOrgProvisions.userId, user.id),
      eq(schema.adminOrgProvisions.status, "pending_activation")
    ),
  });

  if (provision) {
    const parsedUrl = new URL(url);
    const segments = parsedUrl.pathname.split("/");
    const resetIndex = segments.indexOf("reset-password");
    const token = resetIndex !== -1 ? segments[resetIndex + 1] : null;

    if (!token) {
      logger.error({
        type: "admin-provision:activation:token-extraction-failed",
        url,
        userId: user.id,
      });
      await sendPasswordResetEmail({ email: user.email, url });
      return;
    }

    const encodedEmail = encodeURIComponent(user.email);
    const activationUrl = `${env.APP_URL}/definir-senha?token=${token}&email=${encodedEmail}`;

    const [org] = await db
      .select({ name: schema.organizations.name })
      .from(schema.organizations)
      .where(eq(schema.organizations.id, provision.organizationId))
      .limit(1);

    try {
      await sendProvisionActivationEmail({
        email: user.email,
        url: activationUrl,
        userName: user.name,
        organizationName: org?.name ?? "sua organização",
        isTrial: provision.type === "trial",
      });
    } catch (error) {
      // Provision activation falhou (SMTP down ou template erro) — cai no fluxo
      // default de reset para não deixar o user sem email. activationSentAt não
      // é gravado nesse caso, permitindo reenvio posterior.
      logger.error({
        type: "admin-provision:activation:email-failed",
        userId: user.id,
        provisionId: provision.id,
        error: error instanceof Error ? error.message : String(error),
      });
      await sendPasswordResetEmail({ email: user.email, url });
      return;
    }
    await db
      .update(schema.adminOrgProvisions)
      .set({ activationUrl, activationSentAt: new Date() })
      .where(eq(schema.adminOrgProvisions.id, provision.id));
  } else {
    await sendPasswordResetEmail({ email: user.email, url });
  }
}

export async function activateProvisionOnPasswordReset(user: {
  id: string;
}): Promise<void> {
  const provision = await db.query.adminOrgProvisions.findFirst({
    where: and(
      eq(schema.adminOrgProvisions.userId, user.id),
      eq(schema.adminOrgProvisions.status, "pending_activation")
    ),
  });

  if (!provision) {
    return;
  }

  await db
    .update(schema.users)
    .set({ emailVerified: true })
    .where(eq(schema.users.id, user.id));

  await db
    .update(schema.adminOrgProvisions)
    .set({ status: "active", activatedAt: new Date() })
    .where(eq(schema.adminOrgProvisions.id, provision.id));
}

export async function validateUserBeforeDelete(user: {
  id: string;
  email: string;
  role?: string;
}): Promise<string | null> {
  if (user.role === "admin" || user.role === "super_admin") {
    throw new APIError("BAD_REQUEST", {
      code: "ADMIN_ACCOUNT_DELETE_FORBIDDEN",
      message: "Contas de administrador não podem ser excluídas por esta ação.",
    });
  }

  const membership = await db.query.members.findFirst({
    where: eq(schema.members.userId, user.id),
  });

  if (!membership) {
    return null;
  }

  if (membership.role !== "owner") {
    return null;
  }

  const access = await SubscriptionService.checkAccess(
    membership.organizationId
  );
  const paidStatuses: string[] = ["active", "past_due"];
  if (access.hasAccess && paidStatuses.includes(access.status)) {
    throw new APIError("BAD_REQUEST", {
      code: "ACTIVE_SUBSCRIPTION",
      message:
        "Não é possível excluir sua conta com uma assinatura ativa. Cancele a assinatura primeiro.",
    });
  }

  const members = await db.query.members.findMany({
    where: eq(schema.members.organizationId, membership.organizationId),
  });
  const otherMembers = members.filter((m) => m.userId !== user.id);
  if (otherMembers.length > 0) {
    throw new APIError("BAD_REQUEST", {
      code: "ORGANIZATION_HAS_MEMBERS",
      message:
        "Não é possível excluir sua conta. Remova os outros membros da organização primeiro.",
    });
  }

  return membership.organizationId;
}

type UserCreatePayload = User & { email: string };
type UserCreateResult = {
  data: UserCreatePayload & { role?: string; emailVerified?: boolean };
};

export async function applyAdminRolesBeforeUserCreate(
  user: UserCreatePayload
): Promise<UserCreateResult> {
  const { superAdmins, admins } = getAdminEmails();
  const normalizedEmail = user.email.toLowerCase();

  if (superAdmins.includes(normalizedEmail)) {
    return {
      data: {
        ...user,
        role: "super_admin",
        emailVerified: true,
      },
    };
  }

  if (admins.includes(normalizedEmail)) {
    return {
      data: {
        ...user,
        role: "admin",
        emailVerified: true,
      },
    };
  }

  const pendingInvitation = await db.query.invitations.findFirst({
    where: and(
      eq(schema.invitations.email, user.email),
      eq(schema.invitations.status, "pending")
    ),
  });

  if (pendingInvitation) {
    return { data: { ...user, emailVerified: true } };
  }

  return { data: user };
}

export async function assignInitialActiveOrganizationId<
  S extends { userId: string },
>(session: S): Promise<{ data: S & { activeOrganizationId: string | null } }> {
  const membership = await db.query.members.findFirst({
    where: eq(schema.members.userId, session.userId),
    orderBy: (m, { asc }) => [asc(m.createdAt)],
  });

  return {
    data: {
      ...session,
      activeOrganizationId: membership?.organizationId ?? null,
    },
  };
}

export async function activateAdminProvisionOnLogin(session: {
  userId: string;
}): Promise<void> {
  await db
    .update(schema.adminOrgProvisions)
    .set({ status: "active", activatedAt: new Date() })
    .where(
      and(
        eq(schema.adminOrgProvisions.userId, session.userId),
        eq(schema.adminOrgProvisions.status, "pending_activation")
      )
    )
    .catch((error) => {
      logger.error({
        type: "admin-provision:login-activation:failed",
        userId: session.userId,
        error: error instanceof Error ? error.message : String(error),
      });
    });
}

export async function validateCanCreateOrganization(
  user: User & { role?: string; email: string }
): Promise<boolean> {
  if (user.role !== "user") {
    return false;
  }

  const existingMembership = await db.query.members.findFirst({
    where: eq(schema.members.userId, user.id),
  });
  if (existingMembership) {
    return false;
  }

  const pendingInvitation = await db.query.invitations.findFirst({
    where: and(
      eq(schema.invitations.email, user.email),
      eq(schema.invitations.status, "pending")
    ),
  });
  if (pendingInvitation) {
    return false;
  }

  return true;
}

export async function sendOrganizationInvitationForHook(data: {
  id: string;
  email: string;
  role: string | string[];
  inviter: { user: { name: string; email: string } };
  organization: { name: string };
}): Promise<void> {
  const inviteLink = `${env.APP_URL}/convite/${data.id}?email=${encodeURIComponent(data.email)}`;
  await sendOrganizationInvitationEmail({
    to: data.email,
    inviterName: data.inviter.user.name,
    inviterEmail: data.inviter.user.email,
    organizationName: data.organization.name,
    inviteLink,
    role: Array.isArray(data.role) ? data.role.join(", ") : data.role,
  });
}

export async function validateBeforeCreateInvitation({
  invitation,
  organization: org,
}: {
  invitation: { role: string; email: string };
  organization: Organization;
}): Promise<void> {
  if (!(roleValues as readonly string[]).includes(invitation.role)) {
    throw new APIError("BAD_REQUEST", {
      code: "INVALID_ORGANIZATION_ROLE",
      message: `Role inválida: "${invitation.role}". Roles válidas: ${roleValues.join(", ")}`,
    });
  }

  await validateUniqueRole(invitation.role, org.id);

  const existingUser = await db.query.users.findFirst({
    where: eq(schema.users.email, invitation.email),
  });

  if (existingUser) {
    throw new APIError("BAD_REQUEST", {
      code: "USER_ALREADY_EXISTS",
      message:
        "Este email já possui uma conta na plataforma. Convites só podem ser enviados para novos usuários.",
    });
  }
}

/**
 * Reports a post-organization-create side-effect failure.
 *
 * These side-effects are best-effort — signup must succeed even if one
 * or more of them fail. Each failure gets logged + Sentry captured so the
 * operator can alert on the structured `type` tag and fix manually.
 *
 * Recovery paths (documented for future operators):
 * - `organization:trial-creation:failed` → org sem subscription. User vê "sem
 *   plano". Admin pode criar trial manualmente via POST /admin/provisions/trial.
 * - `organization:auto-profile:failed` → org sem profile. GET /organizations/
 *   profile retorna null. Admin pode completar via UI/endpoint de update.
 * - `audit:organization-create:failed` → sem entry de audit. Sem impacto
 *   funcional, gap de compliance. Insert manual em audit_logs se necessário.
 */
function reportOrgEffectFailure(
  error: unknown,
  context: { type: string; organizationId: string; userId?: string }
): void {
  logger.error({
    ...context,
    error: error instanceof Error ? error.message : String(error),
  });
  ErrorReporter.capture(error, {
    tags: {
      type: context.type,
      organizationId: context.organizationId,
    },
  });
}

export async function triggerAfterCreateOrganizationEffects({
  organization: org,
  member,
}: {
  organization: Organization;
  member: { userId: string };
}): Promise<void> {
  try {
    await SubscriptionService.createTrial(org.id);
  } catch (error) {
    reportOrgEffectFailure(error, {
      type: "organization:trial-creation:failed",
      organizationId: org.id,
      userId: member.userId,
    });
  }

  try {
    await OrganizationService.createMinimalProfile(org.id, org.name);
  } catch (error) {
    reportOrgEffectFailure(error, {
      type: "organization:auto-profile:failed",
      organizationId: org.id,
    });
  }

  try {
    await auditOrganizationCreate(org, member.userId);
  } catch (error) {
    reportOrgEffectFailure(error, {
      type: "audit:organization-create:failed",
      organizationId: org.id,
      userId: member.userId,
    });
  }
}

export async function onOrganizationUpdated({
  organization: org,
  user,
}: {
  organization: Organization | null;
  user: User;
}): Promise<void> {
  if (org) {
    await auditOrganizationUpdate(org, user.id);
  }
}

export async function onOrganizationDeleted({
  organization: org,
  user,
}: {
  organization: Organization | null;
  user: User;
}): Promise<void> {
  if (org) {
    await auditOrganizationDelete(org, user.id);
  }
}

export async function onInvitationAccepted({
  invitation,
  member,
  organization: org,
}: {
  invitation: Invitation;
  member: Member;
  organization: Organization;
}): Promise<void> {
  await auditInvitationAccept(
    { id: invitation.id, email: invitation.email, role: invitation.role },
    { id: member.id, userId: member.userId },
    org.id
  );
}

export async function onMemberRoleUpdated({
  member,
  previousRole,
  user,
  organization: org,
}: {
  member: Member;
  previousRole: string;
  user: User;
  organization: Organization;
}): Promise<void> {
  await auditMemberRoleUpdate({
    member: { id: member.id, userId: member.userId },
    previousRole,
    newRole: member.role,
    organizationId: org.id,
    updatedByUserId: user.id,
  });
}

export async function onMemberAdded({
  member,
  user,
  organization: org,
}: {
  member: Member;
  user: User;
  organization: Organization;
}): Promise<void> {
  await auditMemberAdd(
    { id: member.id, userId: member.userId, role: member.role },
    org.id,
    user.id
  );
}

export async function onMemberRemoved({
  member,
  user,
  organization: org,
}: {
  member: Member;
  user: User;
  organization: Organization;
}): Promise<void> {
  await auditMemberRemove(
    { id: member.id, userId: member.userId, role: member.role },
    org.id,
    user.id
  );
}

export async function validateBeforeDeleteOrganization({
  organization: org,
}: {
  organization: Organization;
}): Promise<void> {
  const activeMembers = await db.query.members.findMany({
    where: eq(schema.members.organizationId, org.id),
  });

  const nonOwnerMembers = activeMembers.filter((m) => m.role !== "owner");

  if (nonOwnerMembers.length > 0) {
    throw new APIError("BAD_REQUEST", {
      code: "ORGANIZATION_HAS_ACTIVE_MEMBERS",
      message: `Não é possível excluir a organização. Existem ${nonOwnerMembers.length} membro(s) ativo(s) que devem ser removidos primeiro.`,
    });
  }

  const access = await SubscriptionService.checkAccess(org.id);
  const paidStatuses: string[] = ["active", "past_due"];
  if (access.hasAccess && paidStatuses.includes(access.status)) {
    throw new APIError("BAD_REQUEST", {
      code: "ORGANIZATION_HAS_ACTIVE_SUBSCRIPTION",
      message:
        "Não é possível excluir a organização com assinatura ativa. Cancele a assinatura primeiro.",
    });
  }
}
