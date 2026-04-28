import { expect } from "bun:test";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import type { AuditLog } from "@/db/schema";
import { schema } from "@/db/schema";
import type { AuditAction, AuditResource } from "@/modules/audit/audit.model";

type FindAuditEntryArgs = {
  resourceId: string;
  action: AuditAction;
};

type ExpectAuditEntryArgs = {
  resourceId: string;
  action: AuditAction;
  resource: AuditResource;
  userId: string;
  organizationId: string;
};

export async function findAuditEntry(
  args: FindAuditEntryArgs
): Promise<AuditLog | undefined> {
  const [entry] = await db
    .select()
    .from(schema.auditLogs)
    .where(
      and(
        eq(schema.auditLogs.resourceId, args.resourceId),
        eq(schema.auditLogs.action, args.action)
      )
    );
  return entry;
}

export async function expectAuditEntry(
  args: ExpectAuditEntryArgs
): Promise<AuditLog> {
  const entry = await findAuditEntry({
    resourceId: args.resourceId,
    action: args.action,
  });
  // biome-ignore lint/suspicious/noMisplacedAssertion: shared test helper invoked from inside test() callbacks
  expect(entry).toBeDefined();
  if (!entry) {
    throw new Error(
      `Audit entry not found for resourceId=${args.resourceId} action=${args.action}`
    );
  }
  // biome-ignore lint/suspicious/noMisplacedAssertion: shared test helper invoked from inside test() callbacks
  expect(entry.resource).toBe(args.resource);
  // biome-ignore lint/suspicious/noMisplacedAssertion: shared test helper invoked from inside test() callbacks
  expect(entry.userId).toBe(args.userId);
  // biome-ignore lint/suspicious/noMisplacedAssertion: shared test helper invoked from inside test() callbacks
  expect(entry.organizationId).toBe(args.organizationId);
  // biome-ignore lint/suspicious/noMisplacedAssertion: shared test helper invoked from inside test() callbacks
  expect(entry.resourceId).toBe(args.resourceId);
  return entry;
}
