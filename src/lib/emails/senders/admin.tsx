import { env } from "@/env";
import { sendEmail } from "@/lib/emails/mailer";
import { renderEmail } from "@/lib/emails/render";
import { AdminCancellationNoticeEmail } from "@/lib/emails/templates/payments/admin-cancellation-notice";

export async function sendAdminCancellationNoticeEmail(params: {
  organizationName: string;
  planName: string;
  ownerEmail: string;
  canceledAt: Date;
  reason?: string;
  comment?: string;
}) {
  if (!env.ADMIN_NOTIFICATION_EMAIL) {
    return;
  }

  const { html, text } = await renderEmail(
    <AdminCancellationNoticeEmail
      canceledAt={params.canceledAt}
      comment={params.comment}
      organizationName={params.organizationName}
      ownerEmail={params.ownerEmail}
      planName={params.planName}
      reason={params.reason}
    />
  );
  await sendEmail({
    to: env.ADMIN_NOTIFICATION_EMAIL,
    subject: `[Cancelamento] ${params.organizationName} — Plano ${params.planName}`,
    html,
    text,
  });
}
