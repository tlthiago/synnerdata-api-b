import { beforeAll } from "bun:test";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { seedPlans } from "./helpers/seed";

beforeAll(async () => {
  try {
    await db.execute(sql`SELECT 1`);
  } catch (error) {
    console.error("Failed to connect to database:", error);
    throw new Error("Database connection failed. Check your DATABASE_URL.");
  }

  // Seed test plans and pricing tiers
  await seedPlans();
});
