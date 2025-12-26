import { z } from "zod";

export const entityReferenceSchema = z.object({
  id: z.string().describe("ID da entidade"),
  name: z.string().describe("Nome da entidade"),
});

export type EntityReference = z.infer<typeof entityReferenceSchema>;
