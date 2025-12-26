import type { AbsenceData } from "@/modules/occurrences/absences/absence.model";
import { AbsenceService } from "@/modules/occurrences/absences/absence.service";
import { createTestEmployee } from "./employee";
import { faker } from "./faker";

type CreateTestAbsenceOptions = {
  organizationId: string;
  userId: string;
  employeeId?: string;
  startDate?: string;
  endDate?: string;
  type?: "justified" | "unjustified";
  reason?: string;
  notes?: string;
};

export async function createTestAbsence(
  options: CreateTestAbsenceOptions
): Promise<AbsenceData> {
  const {
    organizationId,
    userId,
    employeeId,
    startDate,
    endDate,
    type,
    reason,
    notes,
  } = options;

  const finalEmployeeId =
    employeeId ??
    (await createTestEmployee({ organizationId, userId })).employee.id;

  const baseDate = new Date();
  const finalStartDate = startDate ?? baseDate.toISOString().split("T")[0];
  const finalEndDate = endDate ?? baseDate.toISOString().split("T")[0];

  return AbsenceService.create({
    organizationId,
    userId,
    employeeId: finalEmployeeId,
    startDate: finalStartDate,
    endDate: finalEndDate,
    type: type ?? faker.helpers.arrayElement(["justified", "unjustified"]),
    reason,
    notes,
  });
}
