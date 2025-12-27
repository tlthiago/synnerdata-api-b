import type { JobPositionData } from "@/modules/organizations/job-positions/job-position.model";
import { JobPositionService } from "@/modules/organizations/job-positions/job-position.service";
import { faker } from "./faker";

type CreateTestJobPositionOptions = {
  organizationId: string;
  userId: string;
  name?: string;
};

/**
 * Creates a test job position using the JobPositionService.
 * Uses faker with pt-BR locale for realistic Brazilian data.
 */
export async function createTestJobPosition(
  options: CreateTestJobPositionOptions
): Promise<JobPositionData> {
  const { organizationId, userId, name } = options;

  return await JobPositionService.create({
    organizationId,
    userId,
    name:
      name ??
      faker.helpers.arrayElement([
        "Desenvolvedor",
        "Analista",
        "Gerente",
        "Coordenador",
        "Assistente",
        "Auxiliar",
        "Técnico",
        "Supervisor",
        "Diretor",
        "Consultor",
        "Especialista",
        "Estagiário",
        "Trainee",
        "Operador",
        "Vendedor",
        "Atendente",
        "Recepcionista",
        "Motorista",
        "Almoxarife",
        "Contador",
      ]),
  });
}

type CreateMultipleJobPositionsOptions = {
  organizationId: string;
  userId: string;
  count: number;
};

/**
 * Creates multiple test job positions with unique names.
 */
export async function createTestJobPositions(
  options: CreateMultipleJobPositionsOptions
): Promise<JobPositionData[]> {
  const { organizationId, userId, count } = options;
  const jobPositions: JobPositionData[] = [];
  const usedNames = new Set<string>();

  const jobPositionNames = [
    "Desenvolvedor",
    "Analista",
    "Gerente",
    "Coordenador",
    "Assistente",
    "Auxiliar",
    "Técnico",
    "Supervisor",
    "Diretor",
    "Consultor",
    "Especialista",
    "Estagiário",
    "Trainee",
    "Operador",
    "Vendedor",
    "Atendente",
    "Recepcionista",
    "Motorista",
    "Almoxarife",
    "Contador",
  ];

  for (let i = 0; i < count; i++) {
    let name = jobPositionNames[i % jobPositionNames.length];
    if (usedNames.has(name)) {
      name = `${name} ${i + 1}`;
    }
    usedNames.add(name);

    const jobPosition = await createTestJobPosition({
      organizationId,
      userId,
      name,
    });
    jobPositions.push(jobPosition);
  }

  return jobPositions;
}
