import type { ProjectData } from "@/modules/organizations/projects/project.model";
import { ProjectService } from "@/modules/organizations/projects/project.service";
import { faker } from "./faker";

type CreateTestProjectOptions = {
  organizationId: string;
  userId: string;
  name?: string;
  description?: string;
  startDate?: string;
  cno?: string;
  employeeIds?: string[];
};

/**
 * Generates a CNO (Cadastro Nacional de Obras) number with 12 digits.
 */
export function generateCno(): string {
  return faker.string.numeric(12);
}

/**
 * Creates a test project using the ProjectService.
 * Uses faker with pt-BR locale for realistic Brazilian data.
 */
export async function createTestProject(
  options: CreateTestProjectOptions
): Promise<ProjectData> {
  const {
    organizationId,
    userId,
    name,
    description,
    startDate,
    cno,
    employeeIds,
  } = options;

  return await ProjectService.create({
    organizationId,
    userId,
    name:
      name ??
      `${faker.helpers.arrayElement([
        "Construção Edifício Aurora",
        "Reforma Shopping Center",
        "Ampliação Fábrica São Paulo",
        "Instalação Elétrica Industrial",
        "Manutenção Predial Empresarial",
        "Construção Residencial Parque Verde",
        "Reforma Hospital Municipal",
        "Infraestrutura Logística Norte",
        "Terraplanagem Condomínio Sul",
        "Acabamento Comercial Centro",
      ])} ${crypto.randomUUID().slice(0, 8)}`,
    description:
      description ??
      faker.helpers.arrayElement([
        "Projeto de construção civil comercial",
        "Reforma e modernização de espaço comercial",
        "Ampliação de instalações industriais",
        "Instalação e manutenção elétrica",
        "Serviços de manutenção predial",
        "Construção de unidades residenciais",
        "Reforma de instalações hospitalares",
        "Projeto de infraestrutura logística",
        "Serviços de terraplanagem e fundação",
        "Acabamento e finalização de obra comercial",
      ]),
    startDate:
      startDate ?? faker.date.past({ years: 2 }).toISOString().split("T")[0],
    cno: cno ?? generateCno(),
    employeeIds,
  });
}

type CreateMultipleProjectsOptions = {
  organizationId: string;
  userId: string;
  count: number;
};

/**
 * Creates multiple test projects with unique names.
 */
export async function createTestProjects(
  options: CreateMultipleProjectsOptions
): Promise<ProjectData[]> {
  const { organizationId, userId, count } = options;
  const projects: ProjectData[] = [];
  const usedNames = new Set<string>();

  const projectNames = [
    "Construção Edifício Aurora",
    "Reforma Shopping Center",
    "Ampliação Fábrica São Paulo",
    "Instalação Elétrica Industrial",
    "Manutenção Predial Empresarial",
    "Construção Residencial Parque Verde",
    "Reforma Hospital Municipal",
    "Infraestrutura Logística Norte",
    "Terraplanagem Condomínio Sul",
    "Acabamento Comercial Centro",
  ];

  for (let i = 0; i < count; i++) {
    const baseName = projectNames[i % projectNames.length];
    const name = `${baseName} ${crypto.randomUUID().slice(0, 8)}`;
    usedNames.add(name);

    const project = await createTestProject({ organizationId, userId, name });
    projects.push(project);
  }

  return projects;
}

/**
 * Adds an employee to a project.
 */
export async function addEmployeeToProject(
  projectId: string,
  employeeId: string,
  organizationId: string,
  userId: string
) {
  return await ProjectService.addEmployee(
    projectId,
    employeeId,
    organizationId,
    userId
  );
}
