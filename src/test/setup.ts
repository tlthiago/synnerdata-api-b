import { beforeAll } from "bun:test";
import { sql } from "drizzle-orm";
import { db } from "@/db";

beforeAll(async () => {
  try {
    await db.execute(sql`SELECT 1`);
  } catch (error) {
    console.error("Failed to connect to database:", error);
    throw new Error("Database connection failed. Check your DATABASE_URL.");
  }
});
