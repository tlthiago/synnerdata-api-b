import { env } from "@/env";
import { sendEmail } from "@/lib/emails/mailer";
import { renderEmail } from "@/lib/emails/render";
import { ContactMessageEmail } from "@/lib/emails/templates/contact/contact-message";

export async function sendContactEmail(params: {
  name: string;
  email: string;
  company: string;
  phone?: string;
  subject: string;
  message: string;
}) {
  const { html, text } = await renderEmail(
    <ContactMessageEmail
      company={params.company}
      email={params.email}
      message={params.message}
      name={params.name}
      phone={params.phone}
      subject={params.subject}
    />
  );
  await sendEmail({
    to: env.CONTACT_INBOX_EMAIL,
    subject: `[Contato Site] ${params.subject}`,
    html,
    text,
  });
}
