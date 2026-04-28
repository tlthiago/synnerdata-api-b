import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import {
  EmployeeOnVacationError,
  EmployeeTerminatedError,
} from "@/modules/employees/errors";

export async function ensureEmployeeNotTerminated(
  employeeId: string,
  organizationId: string
): Promise<void> {
  const [employee] = await db
    .select({ status: schema.employees.status })
    .from(schema.employees)
    .where(
      and(
        eq(schema.employees.id, employeeId),
        eq(schema.employees.organizationId, organizationId),
        isNull(schema.employees.deletedAt)
      )
    )
    .limit(1);

  if (employee?.status === "TERMINATED") {
    throw new EmployeeTerminatedError(employeeId);
  }
}

export async function ensureEmployeeNotOnVacation(
  employeeId: string,
  organizationId: string
): Promise<void> {
  const [employee] = await db
    .select({ status: schema.employees.status })
    .from(schema.employees)
    .where(
      and(
        eq(schema.employees.id, employeeId),
        eq(schema.employees.organizationId, organizationId),
        isNull(schema.employees.deletedAt)
      )
    )
    .limit(1);

  if (employee?.status === "ON_VACATION") {
    throw new EmployeeOnVacationError(employeeId);
  }
}

export async function ensureEmployeeActive(
  employeeId: string,
  organizationId: string
): Promise<void> {
  const [employee] = await db
    .select({ status: schema.employees.status })
    .from(schema.employees)
    .where(
      and(
        eq(schema.employees.id, employeeId),
        eq(schema.employees.organizationId, organizationId),
        isNull(schema.employees.deletedAt)
      )
    )
    .limit(1);

  if (employee?.status === "TERMINATED") {
    throw new EmployeeTerminatedError(employeeId);
  }

  if (employee?.status === "ON_VACATION") {
    throw new EmployeeOnVacationError(employeeId);
  }
}
