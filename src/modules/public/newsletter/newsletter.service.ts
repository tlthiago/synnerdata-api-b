import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import type { SubscribeNewsletter } from "./newsletter.model";

export abstract class NewsletterService {
  static async subscribe(input: SubscribeNewsletter): Promise<void> {
    const [existing] = await db
      .select()
      .from(schema.newsletterSubscribers)
      .where(eq(schema.newsletterSubscribers.email, input.email))
      .limit(1);

    if (existing) {
      if (existing.status === "active") {
        return;
      }
      await db
        .update(schema.newsletterSubscribers)
        .set({ status: "active" })
        .where(eq(schema.newsletterSubscribers.id, existing.id));
      return;
    }

    await db.insert(schema.newsletterSubscribers).values({
      id: `newsletter-${crypto.randomUUID()}`,
      email: input.email,
    });
  }
}
