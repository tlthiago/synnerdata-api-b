import { beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { TerminationService } from "@/modules/occurrences/terminations/termination.service";
import { TerminationJobsService } from "@/modules/occurrences/terminations/termination-jobs.service";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { createTestEmployee } from "@/test/helpers/employee";
import { createTestUserWithOrganization } from "@/test/helpers/user";

function offsetISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

describe("TerminationJobsService.processScheduledTerminations", () => {
  let _app: TestApp;

  beforeAll(() => {
    _app = createTestApp();
  });

  test("flips scheduled to completed when terminationDate <= today", async () => {
    const { organizationId, user } = await createTestUserWithOrganization();
    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
    });

    const futureDate = offsetISO(30);
    const created = await TerminationService.create({
      employeeId: employee.id,
      terminationDate: futureDate,
      type: "DISMISSAL_WITHOUT_CAUSE",
      lastWorkingDay: futureDate,
      noticePeriodWorked: false,
      organizationId,
      userId: user.id,
    });
    expect(created.status).toBe("scheduled");

    // Backdate so the job picks it up
    const yesterday = offsetISO(-1);
    await db
      .update(schema.terminations)
      .set({ terminationDate: yesterday })
      .where(eq(schema.terminations.id, created.id));

    const result = await TerminationJobsService.processScheduledTerminations();
    expect(result.updated).toContain(created.id);

    const [refreshed] = await db
      .select({ status: schema.terminations.status })
      .from(schema.terminations)
      .where(eq(schema.terminations.id, created.id));
    expect(refreshed?.status).toBe("completed");

    const [emp] = await db
      .select({ status: schema.employees.status })
      .from(schema.employees)
      .where(eq(schema.employees.id, employee.id));
    expect(emp?.status).toBe("TERMINATED");
  });

  test("ignores soft-deleted terminations", async () => {
    const { organizationId, user } = await createTestUserWithOrganization();
    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
    });

    const futureDate = offsetISO(30);
    const created = await TerminationService.create({
      employeeId: employee.id,
      terminationDate: futureDate,
      type: "DISMISSAL_WITHOUT_CAUSE",
      lastWorkingDay: futureDate,
      noticePeriodWorked: false,
      organizationId,
      userId: user.id,
    });

    await TerminationService.delete(created.id, organizationId, user.id);

    // Backdate after soft-delete
    const yesterday = offsetISO(-1);
    await db
      .update(schema.terminations)
      .set({ terminationDate: yesterday })
      .where(eq(schema.terminations.id, created.id));

    const result = await TerminationJobsService.processScheduledTerminations();
    expect(result.updated).not.toContain(created.id);
  });

  test("is idempotent — second run does not re-process the same record", async () => {
    const { organizationId, user } = await createTestUserWithOrganization();
    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
    });

    const futureDate = offsetISO(30);
    const created = await TerminationService.create({
      employeeId: employee.id,
      terminationDate: futureDate,
      type: "DISMISSAL_WITHOUT_CAUSE",
      lastWorkingDay: futureDate,
      noticePeriodWorked: false,
      organizationId,
      userId: user.id,
    });

    const yesterday = offsetISO(-1);
    await db
      .update(schema.terminations)
      .set({ terminationDate: yesterday })
      .where(eq(schema.terminations.id, created.id));

    const r1 = await TerminationJobsService.processScheduledTerminations();
    expect(r1.updated).toContain(created.id);

    const r2 = await TerminationJobsService.processScheduledTerminations();
    expect(r2.updated).not.toContain(created.id);
  });
});
