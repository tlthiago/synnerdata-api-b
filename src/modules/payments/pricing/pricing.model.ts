import { z } from "zod";
import { successResponseSchema } from "@/lib/responses/response.types";

export const pricingTierSchema = z.object({
  id: z.string().describe("Pricing tier ID"),
  planId: z.string().describe("Plan ID"),
  minEmployees: z.number().int().min(0).describe("Minimum employees"),
  maxEmployees: z.number().int().min(1).describe("Maximum employees"),
  priceMonthly: z.number().int().min(0).describe("Monthly price in cents"),
  priceYearly: z.number().int().min(0).describe("Yearly price in cents"),
});

export const getPricingTierResponseSchema = successResponseSchema(
  z.object({
    tier: pricingTierSchema,
  })
);

export const listPricingTiersResponseSchema = successResponseSchema(
  z.object({
    tiers: z.array(pricingTierSchema),
  })
);

export type PricingTierData = z.infer<typeof pricingTierSchema>;
export type GetPricingTierResponse = z.infer<
  typeof getPricingTierResponseSchema
>;
export type ListPricingTiersResponse = z.infer<
  typeof listPricingTiersResponseSchema
>;

export type BillingCycle = "monthly" | "yearly";

// Data-only types for service layer
export type GetPricingTierData = { tier: PricingTierData };
export type ListPricingTiersData = { tiers: PricingTierData[] };
