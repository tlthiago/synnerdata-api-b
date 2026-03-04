import { z } from "zod";

export const subscribeNewsletterSchema = z.object({
  email: z
    .email("Email inválido")
    .describe("Email para inscrição na newsletter"),
});

export type SubscribeNewsletter = z.infer<typeof subscribeNewsletterSchema>;
