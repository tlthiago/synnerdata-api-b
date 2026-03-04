import { sendContactEmail } from "@/lib/email";
import type { ContactBody } from "./contact.model";

export abstract class ContactService {
  static async send(input: ContactBody): Promise<void> {
    await sendContactEmail(input);
  }
}
