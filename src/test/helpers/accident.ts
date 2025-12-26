import type { AccidentData } from "@/modules/occurrences/accidents/accident.model";
import { AccidentService } from "@/modules/occurrences/accidents/accident.service";
import { createTestEmployee } from "./employee";
import { faker } from "./faker";

type AccidentOverrides = {
  employeeId?: string;
  date?: string;
  description?: string;
  nature?: string;
  cat?: string;
  measuresTaken?: string;
  notes?: string;
};

type CreateTestAccidentOptions = {
  organizationId: string;
  userId: string;
} & AccidentOverrides;

export async function createTestAccident(
  options: CreateTestAccidentOptions
): Promise<AccidentData> {
  const { organizationId, userId, employeeId, ...overrides } = options;

  let finalEmployeeId = employeeId;
  if (!finalEmployeeId) {
    const { employee } = await createTestEmployee({ organizationId, userId });
    finalEmployeeId = employee.id;
  }

  const accident = await AccidentService.create({
    organizationId,
    userId,
    employeeId: finalEmployeeId,
    date:
      overrides.date ??
      faker.date.recent({ days: 30 }).toISOString().split("T")[0],
    description:
      overrides.description ??
      faker.helpers.arrayElement([
        "Queda de escada durante manutenção",
        "Corte superficial ao manusear ferramenta",
        "Escorregão no piso molhado",
        "Impacto com equipamento em movimento",
        "Queimadura leve ao operar máquina",
      ]),
    nature:
      overrides.nature ??
      faker.helpers.arrayElement([
        "Queda",
        "Corte",
        "Impacto",
        "Queimadura",
        "Esforço repetitivo",
        "Exposição a agente químico",
      ]),
    cat: overrides.cat,
    measuresTaken:
      overrides.measuresTaken ??
      faker.helpers.arrayElement([
        "Primeiros socorros aplicados no local",
        "Encaminhamento ao pronto-socorro",
        "Afastamento para recuperação",
        "Revisão do procedimento de segurança",
        "Instalação de sinalização adicional",
      ]),
    notes: overrides.notes,
  });

  return accident;
}
