import { isAPIError } from "better-auth/api";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { auth } from "@/lib/auth";
import { buildAuditEntry } from "@/lib/auth/audit-helpers";
import { validateUserBeforeDelete } from "@/lib/auth/hooks";
import { sendBestEffort } from "@/lib/emails/mailer";
import { sendAccountAnonymizedEmail } from "@/lib/emails/senders/auth";
import { AppError } from "@/lib/errors/base-error";
import { BadRequestError } from "@/lib/errors/http-errors";
import { logger } from "@/lib/logger";
import type { AuditLogEntry } from "@/modules/audit/audit.model";
import { AuditService } from "@/modules/audit/audit.service";

const ANONYMIZED_NAME = "Usuário removido";

const anonymizedEmail = (userId: string): string =>
  `anon-${userId}@deleted.synnerdata.local`;

type AnonymizeInput = {
  userId: string;
  password: string;
  requestHeaders: Headers;
};

type LoadedUser = {
  id: string;
  email: string;
  role: string | null;
};

async function getUserOrThrow(userId: string): Promise<LoadedUser> {
  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
    columns: { id: true, email: true, role: true },
  });
  if (!user) {
    throw new BadRequestError("Usuário não encontrado.", {
      code: "USER_NOT_FOUND",
    });
  }
  return { id: user.id, email: user.email, role: user.role ?? null };
}

type APIErrorLike = { body?: { code?: string } };

export async function verifyPasswordOrThrow(
  password: string,
  headers: Headers
): Promise<void> {
  try {
    await auth.api.verifyPassword({ body: { password }, headers });
  } catch (error) {
    if (
      isAPIError(error) &&
      (error as APIErrorLike).body?.code === "INVALID_PASSWORD"
    ) {
      throw new BadRequestError("Senha incorreta.", {
        code: "INVALID_PASSWORD",
      });
    }
    throw error;
  }
}

export function buildAnonymizeAuditEntry(
  user: { id: string },
  orgIdCascade: string | null
): AuditLogEntry {
  return buildAuditEntry({
    action: "anonymize",
    resource: "user",
    resourceId: user.id,
    userId: user.id,
    before: {
      wasOwnerOfTrialOrg: orgIdCascade !== null,
      organizationCascade: orgIdCascade,
    },
    after: undefined,
  });
}

export abstract class AnonymizeService {
  static async anonymize(input: AnonymizeInput): Promise<void> {
    const { userId, password, requestHeaders } = input;

    const user = await getUserOrThrow(userId);
    const originalEmail = user.email;

    try {
      await verifyPasswordOrThrow(password, requestHeaders);
    } catch (error) {
      if (error instanceof BadRequestError) {
        logger.warn({
          type: "auth:anonymize:rejected",
          userId,
          reason: error.code,
        });
      }
      throw error;
    }

    let orgIdToCascade: string | null;
    try {
      orgIdToCascade = await validateUserBeforeDelete({
        id: user.id,
        email: user.email,
        role: user.role ?? undefined,
      });
    } catch (error) {
      if (error instanceof AppError) {
        logger.warn({
          type: "auth:anonymize:rejected",
          userId,
          reason: error.code,
        });
      }
      throw error;
    }

    logger.info({
      type: "auth:anonymize:started",
      userId,
      hasOrgCascade: orgIdToCascade !== null,
    });

    try {
      await db.transaction(async (tx) => {
        await tx
          .update(schema.users)
          .set({
            name: ANONYMIZED_NAME,
            email: anonymizedEmail(user.id),
            image: null,
            emailVerified: false,
            anonymizedAt: new Date(),
          })
          .where(eq(schema.users.id, user.id));

        // Better Auth credential surface (better-auth 1.6.9): sessions, accounts,
        // twoFactors, apikeys, invitations. Future plugins (e.g., passkeys) may
        // add new tables tied to userId — re-evaluate on Better Auth upgrade.
        await tx
          .delete(schema.sessions)
          .where(eq(schema.sessions.userId, user.id));
        await tx
          .delete(schema.accounts)
          .where(eq(schema.accounts.userId, user.id));
        await tx
          .delete(schema.twoFactors)
          .where(eq(schema.twoFactors.userId, user.id));
        await tx
          .delete(schema.apikeys)
          .where(eq(schema.apikeys.referenceId, user.id));
        await tx
          .delete(schema.invitations)
          .where(eq(schema.invitations.inviterId, user.id));

        if (orgIdToCascade) {
          await tx
            .delete(schema.organizations)
            .where(eq(schema.organizations.id, orgIdToCascade));
        }

        await AuditService.log(
          buildAnonymizeAuditEntry({ id: user.id }, orgIdToCascade),
          tx
        );
      });
    } catch (error) {
      logger.error({
        type: "auth:anonymize:failed",
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    logger.info({
      type: "auth:anonymize:completed",
      userId,
      organizationCascade: orgIdToCascade,
    });

    await sendBestEffort(
      () => sendAccountAnonymizedEmail({ email: originalEmail }),
      { type: "email:account-anonymized:failed", userId }
    );
  }
}
