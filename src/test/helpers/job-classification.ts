import type { JobClassificationData } from "@/modules/organizations/job-classifications/job-classification.model";
import { JobClassificationService } from "@/modules/organizations/job-classifications/job-classification.service";
import { faker } from "./faker";

type CreateTestJobClassificationOptions = {
  organizationId: string;
  userId: string;
  name?: string;
  cboOccupationId?: string;
};

/**
 * Creates a test job classification (CBO) using the JobClassificationService.
 * Uses faker with pt-BR locale for realistic Brazilian data.
 */
export async function createTestJobClassification(
  options: CreateTestJobClassificationOptions
): Promise<JobClassificationData> {
  const { organizationId, userId, name, cboOccupationId } = options;

  return await JobClassificationService.create({
    organizationId,
    userId,
    cboOccupationId,
    name:
      name ??
      `${faker.helpers.arrayElement([
        "Analista de Sistemas",
        "Programador de Sistemas",
        "Administrador de Banco de Dados",
        "Engenheiro de Software",
        "Técnico em Informática",
        "Gerente de Projetos",
        "Analista de Recursos Humanos",
        "Contador",
        "Auxiliar Administrativo",
        "Técnico de Segurança do Trabalho",
        "Engenheiro Civil",
        "Arquiteto",
        "Advogado",
        "Médico do Trabalho",
        "Enfermeiro do Trabalho",
        "Operador de Máquinas",
        "Eletricista",
        "Mecânico Industrial",
        "Soldador",
        "Motorista de Caminhão",
      ])} ${crypto.randomUUID().slice(0, 8)}`,
  });
}

type CreateMultipleJobClassificationsOptions = {
  organizationId: string;
  userId: string;
  count: number;
};

/**
 * Creates multiple test job classifications with unique names.
 */
export async function createTestJobClassifications(
  options: CreateMultipleJobClassificationsOptions
): Promise<JobClassificationData[]> {
  const { organizationId, userId, count } = options;
  const jobClassifications: JobClassificationData[] = [];
  const usedNames = new Set<string>();

  const jobClassificationNames = [
    "Analista de Sistemas",
    "Programador de Sistemas",
    "Administrador de Banco de Dados",
    "Engenheiro de Software",
    "Técnico em Informática",
    "Gerente de Projetos",
    "Analista de Recursos Humanos",
    "Contador",
    "Auxiliar Administrativo",
    "Técnico de Segurança do Trabalho",
    "Engenheiro Civil",
    "Arquiteto",
    "Advogado",
    "Médico do Trabalho",
    "Enfermeiro do Trabalho",
    "Operador de Máquinas",
    "Eletricista",
    "Mecânico Industrial",
    "Soldador",
    "Motorista de Caminhão",
  ];

  for (let i = 0; i < count; i++) {
    const baseName = jobClassificationNames[i % jobClassificationNames.length];
    const name = `${baseName} ${crypto.randomUUID().slice(0, 8)}`;
    usedNames.add(name);

    const jobClassification = await createTestJobClassification({
      organizationId,
      userId,
      name,
    });
    jobClassifications.push(jobClassification);
  }

  return jobClassifications;
}
