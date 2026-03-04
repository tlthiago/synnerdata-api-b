import { z } from "zod";
import { successResponseSchema } from "@/lib/responses/response.types";

// ============================================================
// LIST ORGANIZATIONS (GET /)
// ============================================================

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

// ============================================================
// ORGANIZATION DETAILS (GET /:id)
// ============================================================

export const organizationIdParamSchema = z.object({
  id: z.string().describe("Organization ID"),
});

const memberDataSchema = z.object({
  id: z.string(),
  userId: z.string(),
  role: z.string(),
  user: z.object({
    name: z.string(),
    email: z.string(),
  }),
});

const profileDataSchema = z.object({
  tradeName: z.string(),
  legalName: z.string().nullable(),
  taxId: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  street: z.string().nullable(),
  number: z.string().nullable(),
  neighborhood: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  zipCode: z.string().nullable(),
  industry: z.string().nullable(),
  businessArea: z.string().nullable(),
  pbUrl: z.string().nullable(),
  status: z.string(),
});

const subscriptionDataSchema = z.object({
  planName: z.string(),
  status: z.string(),
  startDate: z.coerce.date().nullable(),
});

const organizationDetailsDataSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  createdAt: z.coerce.date(),
  profile: profileDataSchema.nullable(),
  memberCount: z.number(),
  members: z.array(memberDataSchema),
  subscription: subscriptionDataSchema.nullable(),
});

export const getOrganizationDetailsResponseSchema = successResponseSchema(
  organizationDetailsDataSchema
);

export type MemberData = z.infer<typeof memberDataSchema>;
export type OrganizationDetailsData = z.infer<
  typeof organizationDetailsDataSchema
>;

// ============================================================
// UPDATE POWER BI URL (PUT /:id/power-bi-url)
// ============================================================

export const updatePowerBiUrlSchema = z.object({
  url: z
    .string()
    .url("URL inválida")
    .nullable()
    .describe("Power BI dashboard URL (null to remove)"),
});

export type UpdatePowerBiUrlInput = z.infer<typeof updatePowerBiUrlSchema>;

const updatedProfileDataSchema = z.object({
  pbUrl: z.string().nullable(),
});

export const updatePowerBiUrlResponseSchema = successResponseSchema(
  updatedProfileDataSchema
);
