import { env } from "@/env";
import { sendWelcomeEmail } from "@/lib/email";
import { logger } from "@/lib/logger";

function normalizeEmailList(raw: string): string[] {
  return raw
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function getAdminEmails(): {
  superAdmins: string[];
  admins: string[];
} {
  return {
    superAdmins: normalizeEmailList(env.SUPER_ADMIN_EMAILS),
    admins: normalizeEmailList(env.ADMIN_EMAILS),
  };
}

export async function handleWelcomeEmail(user: {
  email: string;
  name: string;
}): Promise<void> {
  try {
    await sendWelcomeEmail({
      to: user.email,
      userName: user.name,
    });
  } catch (error) {
    logger.error({
      type: "email:welcome:failed",
      email: user.email,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
