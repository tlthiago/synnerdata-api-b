import { drizzle } from "drizzle-orm/node-postgres";
import { env } from "@/env";
import { fullSchema } from "./schema";

export const db = drizzle(env.DATABASE_URL, {
  schema: fullSchema,
  casing: "snake_case",
});
