import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";

const SYSTEM_TEST_USER_ID = "system-test-user";

export async function getOrCreateSystemTestUser(): Promise<string> {
  const existing = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.id, SYSTEM_TEST_USER_ID))
    .limit(1);

  if (existing.length > 0) {
    return SYSTEM_TEST_USER_ID;
  }

  await db.insert(schema.users).values({
    id: SYSTEM_TEST_USER_ID,
    name: "System Test User",
    email: "system-test-user@example.test",
    emailVerified: true,
  });

  return SYSTEM_TEST_USER_ID;
}
