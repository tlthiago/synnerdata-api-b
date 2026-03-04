import type { WarningData } from "@/modules/occurrences/warnings/warning.model";
import { WarningService } from "@/modules/occurrences/warnings/warning.service";
import { createTestEmployee } from "./employee";
import { faker } from "./faker";

type WarningType = "verbal" | "written" | "suspension";

type WarningOverrides = {
  employeeId?: string;
  date?: string;
  type?: WarningType;
  reason?: string;
  description?: string;
  witnessName?: string;
  acknowledged?: boolean;
  acknowledgedAt?: string;
  notes?: string;
};

type CreateTestWarningOptions = {
  organizationId: string;
  userId: string;
} & WarningOverrides;

export async function createTestWarning(
  options: CreateTestWarningOptions
): Promise<WarningData> {
  const { organizationId, userId, employeeId, ...overrides } = options;

  let finalEmployeeId = employeeId;
  if (!finalEmployeeId) {
    const { employee } = await createTestEmployee({ organizationId, userId });
    finalEmployeeId = employee.id;
  }

  const warning = await WarningService.create({
    organizationId,
    userId,
    employeeId: finalEmployeeId,
    date:
      overrides.date ??
      faker.date.recent({ days: 30 }).toISOString().split("T")[0],
    type:
      overrides.type ??
      faker.helpers.arrayElement(["verbal", "written", "suspension"] as const),
    reason:
      overrides.reason ??
      faker.helpers.arrayElement([
        "Atraso injustificado",
        "Falta não justificada",
        "Descumprimento de normas",
        "Comportamento inadequado",
        "Uso indevido de equipamentos",
      ]),
    description: overrides.description,
    witnessName: overrides.witnessName,
    acknowledged: overrides.acknowledged ?? false,
    acknowledgedAt: overrides.acknowledgedAt,
    notes: overrides.notes,
  });

  return warning;
}
