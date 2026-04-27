import { createTransport } from "nodemailer";
import { env } from "@/env";
import { logger } from "@/lib/logger";

const isProdEmail = env.NODE_ENV === "production";

const transporter = createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_PORT === 465,
  requireTLS: isProdEmail && env.SMTP_PORT !== 465,
  auth:
    env.SMTP_USER && env.SMTP_PASSWORD
      ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD }
      : undefined,
  ...(isProdEmail && {
    pool: true,
    maxConnections: 3,
    maxMessages: 100,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
  }),
});

const FROM_ADDRESS = env.SMTP_FROM_NAME
  ? { name: env.SMTP_FROM_NAME, address: env.SMTP_FROM }
  : env.SMTP_FROM;

type SendEmailParams = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

export async function sendEmail({ to, subject, html, text }: SendEmailParams) {
  await transporter.sendMail({
    from: FROM_ADDRESS,
    to,
    subject,
    html,
    ...(text && { text }),
  });
}

/**
 * Wraps a best-effort email send — logs failures but never propagates them.
 * Use in system/cron-initiated flows where the primary operation already
 * succeeded and the email is purely a notification.
 *
 * Critical user-initiated emails (verification, reset, 2FA, invitation,
 * contact, user-facing admin actions) keep throwing — user needs feedback.
 */
export async function sendBestEffort(
  send: () => Promise<void>,
  context: { type: string; [key: string]: unknown }
): Promise<void> {
  try {
    await send();
  } catch (error) {
    logger.error({
      ...context,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
