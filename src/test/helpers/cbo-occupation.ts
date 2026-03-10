import { db } from "@/db";
import { schema } from "@/db/schema";

type CreateTestCboOccupationOptions = {
  code?: string;
  title?: string;
};

/**
 * Creates a test CBO occupation directly in the database.
 */
export async function createTestCboOccupation(
  options: CreateTestCboOccupationOptions = {}
) {
  const id = `cbo-${crypto.randomUUID()}`;
  const code =
    options.code ??
    `${Math.floor(1000 + Math.random() * 8999)}-${Math.floor(10 + Math.random() * 89)}`;
  const title = options.title ?? `Ocupação Teste ${id.slice(0, 8)}`;
  const familyCode = code.slice(0, 4);

  const [row] = await db
    .insert(schema.cboOccupations)
    .values({
      id,
      code,
      title,
      familyCode,
      familyTitle: `Família ${familyCode}`,
    })
    .returning();

  return row;
}
