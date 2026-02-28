import { z } from "zod";
import { successResponseSchema } from "@/lib/responses/response.types";

export const listOrganizationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
});

export type ListOrganizationsQuery = z.infer<
  typeof listOrganizationsQuerySchema
>;

export type ListOrganizationsInput = {
  page: number;
  limit: number;
  search?: string;
};

export const organizationItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  createdAt: z.string(),
  tradeName: z.string().nullable(),
  taxId: z.string().nullable(),
  hasPowerBiUrl: z.boolean(),
  memberCount: z.number(),
  status: z.string().nullable(),
});

export type OrganizationItem = z.infer<typeof organizationItemSchema>;

export const listOrganizationsDataSchema = z.object({
  items: z.array(organizationItemSchema),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
});

export type ListOrganizationsData = z.infer<typeof listOrganizationsDataSchema>;

export const listOrganizationsResponseSchema = successResponseSchema(
  listOrganizationsDataSchema
);
