import { sendContactEmail } from "@/lib/emails/senders/contact";
import type { ContactBody } from "./contact.model";

export abstract class ContactService {
  static async send(input: ContactBody): Promise<void> {
    await sendContactEmail(input);
  }
}
