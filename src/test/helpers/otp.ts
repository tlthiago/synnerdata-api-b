import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";

/**
 * Get the latest OTP for an email from the verifications table
 * Better Auth stores OTP with identifier = "sign-in-otp-{email}"
 * and value = "{otp}:{attemptCount}"
 */
export async function getLatestOTP(email: string): Promise<string | null> {
  const identifier = `sign-in-otp-${email}`;

  const [verification] = await db
    .select()
    .from(schema.verifications)
    .where(eq(schema.verifications.identifier, identifier))
    .orderBy(desc(schema.verifications.createdAt))
    .limit(1);

  if (!verification?.value) {
    return null;
  }

  // Extract OTP from "123456:0" format
  const otp = verification.value.split(":")[0];
  return otp ?? null;
}

/**
 * Wait for OTP to be available in the database (with retry)
 */
export async function waitForOTP(
  email: string,
  maxRetries = 10,
  delayMs = 100
): Promise<string> {
  for (let i = 0; i < maxRetries; i++) {
    const otp = await getLatestOTP(email);
    if (otp) {
      return otp;
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  throw new Error(`OTP not found for email: ${email}`);
}
