import { beforeAll, describe, expect, test } from "bun:test";
import { and, eq, isNull } from "drizzle-orm";
import ExcelJS from "exceljs";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { generateCpf } from "@/test/helpers/faker";
import { createTestJobClassification } from "@/test/helpers/job-classification";
import { createTestJobPosition } from "@/test/helpers/job-position";
import { createTestSector } from "@/test/helpers/sector";
import { createTestUserWithOrganization } from "@/test/helpers/user";
import { IMPORT_COLUMNS, SHEET_NAME_EMPLOYEES } from "../import.constants";
import { EmployeeImportEmptyFileError } from "../import.errors";
import { ImportService } from "../import.service";
import { TemplateService } from "../template.service";

// ---------------------------------------------------------------------------
// Test Setup
// ---------------------------------------------------------------------------

let organizationId: string;
let userId: string;
let sectorName: string;
let jobPositionName: string;
let jobClassificationName: string;
let templateBuffer: Buffer;

beforeAll(async () => {
  const result = await createTestUserWithOrganization({
    emailVerified: true,
    skipTrialCreation: true,
  });
  organizationId = result.organizationId;
  userId = result.user.id;

  const sector = await createTestSector({
    organizationId,
    userId,
    name: "Import Setor",
  });
  sectorName = sector.name;

  const jobPosition = await createTestJobPosition({
    organizationId,
    userId,
    name: "Import Cargo",
  });
  jobPositionName = jobPosition.name;

  const jobClassification = await createTestJobClassification({
    organizationId,
    userId,
    name: "Import CBO",
  });
  jobClassificationName = jobClassification.name;

  // Set up a paid subscription so employee limit is high enough for tests
  await setupSubscription(organizationId);

  // Generate template once for all tests
  templateBuffer = await TemplateService.generate(organizationId);
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function setupSubscription(orgId: string) {
  const { PlanFactory } = await import(
    "@/test/factories/payments/plan.factory"
  );
  const { SubscriptionFactory } = await import(
    "@/test/factories/payments/subscription.factory"
  );
  const { plan, tiers } = await PlanFactory.createPaid("gold");
  const firstTier = PlanFactory.getFirstTier({ plan, tiers });
  await SubscriptionFactory.createActive(orgId, plan.id, {
    pricingTierId: firstTier.id,
  });
}

async function buildWorkbookWithRows(
  template: Buffer,
  rows: Record<string, unknown>[]
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  // @ts-expect-error — Bun's Buffer<ArrayBufferLike> vs Node's Buffer<ArrayBuffer>
  await workbook.xlsx.load(template);
  const sheet = workbook.getWorksheet(SHEET_NAME_EMPLOYEES);
  if (!sheet) {
    throw new Error("Sheet not found in template");
  }

  for (const [rowIdx, rowData] of rows.entries()) {
    const excelRow = sheet.getRow(rowIdx + 2);
    for (const [colIdx, col] of IMPORT_COLUMNS.entries()) {
      const value = rowData[col.key];
      if (value !== undefined && value !== null) {
        excelRow.getCell(colIdx + 1).value = value as ExcelJS.CellValue;
      }
    }
    excelRow.commit();
  }

  return Buffer.from(await workbook.xlsx.writeBuffer()) as Buffer;
}

function validRow(overrides?: Record<string, unknown>) {
  return {
    name: `Import Test ${crypto.randomUUID().slice(0, 8)}`,
    email: `import-${crypto.randomUUID().slice(0, 8)}@test.com`,
    mobile: "11999887766",
    birthDate: "15/01/1990",
    gender: "Masculino",
    maritalStatus: "Solteiro(a)",
    birthplace: "São Paulo",
    nationality: "Brasileiro",
    motherName: "Maria Import",
    cpf: generateCpf(),
    identityCard: "123456789",
    pis: "12345678901",
    workPermitNumber: "1234567",
    workPermitSeries: "0001",
    street: "Rua Import",
    streetNumber: "100",
    neighborhood: "Centro",
    city: "São Paulo",
    state: "SP",
    zipCode: "01234567",
    hireDate: "10/01/2024",
    contractType: "CLT",
    salary: 5000,
    sectorId: sectorName,
    jobPositionId: jobPositionName,
    jobClassificationId: jobClassificationName,
    workShift: "5x2",
    weeklyHours: 44,
    educationLevel: "Graduação",
    hasSpecialNeeds: "Não",
    hasChildren: "Não",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ImportService.importFromFile", () => {
  test("imports valid rows successfully", async () => {
    const rows = [validRow(), validRow()];
    const buffer = await buildWorkbookWithRows(templateBuffer, rows);

    const result = await ImportService.importFromFile({
      buffer,
      organizationId,
      userId,
    });

    expect(result.total).toBe(2);
    expect(result.imported).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  test("reports errors for invalid rows without failing valid ones", async () => {
    const rows = [
      validRow(),
      validRow({ cpf: "00000000000" }), // invalid CPF
      validRow(),
    ];
    const buffer = await buildWorkbookWithRows(templateBuffer, rows);

    const result = await ImportService.importFromFile({
      buffer,
      organizationId,
      userId,
    });

    expect(result.total).toBe(3);
    expect(result.imported).toBe(2);
    expect(result.failed).toBeGreaterThanOrEqual(1);
    expect(result.errors.length).toBeGreaterThanOrEqual(1);

    const cpfError = result.errors.find((e) => e.field === "CPF");
    expect(cpfError).toBeDefined();
  });

  test("detects duplicate CPFs within the same file", async () => {
    const sharedCpf = generateCpf();
    const rows = [validRow({ cpf: sharedCpf }), validRow({ cpf: sharedCpf })];
    const buffer = await buildWorkbookWithRows(templateBuffer, rows);

    const result = await ImportService.importFromFile({
      buffer,
      organizationId,
      userId,
    });

    expect(result.total).toBe(2);
    expect(result.imported).toBe(1);
    expect(result.failed).toBe(1);

    const dupError = result.errors.find(
      (e) => e.field === "CPF" && e.message.includes("duplicado")
    );
    expect(dupError).toBeDefined();
    expect(dupError?.row).toBe(3); // second row (row 3 in Excel since header is row 1)
  });

  test("translates error field keys to PT-BR column headers", async () => {
    const rows = [
      validRow({
        birthDate: "data-invalida",
        gender: "invalido",
        salary: "abc",
        sectorId: "Setor Inexistente",
      }),
    ];
    const buffer = await buildWorkbookWithRows(templateBuffer, rows);

    const result = await ImportService.importFromFile({
      buffer,
      organizationId,
      userId,
    });

    expect(result.imported).toBe(0);
    expect(result.failed).toBeGreaterThanOrEqual(1);

    const fieldNames = result.errors.map((e) => e.field);
    expect(fieldNames).toContain("Data de nascimento");
    expect(fieldNames).toContain("Sexo");
    expect(fieldNames).toContain("Salário");
    expect(fieldNames).toContain("Setor");

    // Must NOT contain the internal English keys
    expect(fieldNames).not.toContain("birthDate");
    expect(fieldNames).not.toContain("gender");
    expect(fieldNames).not.toContain("salary");
    expect(fieldNames).not.toContain("sectorId");
  });

  test("rejects empty file", async () => {
    // Build a workbook with no data rows (just the header)
    const buffer = await buildWorkbookWithRows(templateBuffer, []);

    await expect(
      ImportService.importFromFile({
        buffer,
        organizationId,
        userId,
      })
    ).rejects.toBeInstanceOf(EmployeeImportEmptyFileError);
  });

  test("respects employee plan limit", async () => {
    // Create a fresh org with a small tier (trial plan with max 10 employees)
    const limitResult = await createTestUserWithOrganization({
      emailVerified: true,
    });
    const limitOrgId = limitResult.organizationId;
    const limitUserId = limitResult.user.id;

    // Create required entities for this org
    await createTestSector({
      organizationId: limitOrgId,
      userId: limitUserId,
      name: "Import Setor",
    });
    await createTestJobPosition({
      organizationId: limitOrgId,
      userId: limitUserId,
      name: "Import Cargo",
    });
    await createTestJobClassification({
      organizationId: limitOrgId,
      userId: limitUserId,
      name: "Import CBO",
    });

    // Trial plan has max 10 employees — generate the template for this org
    const limitTemplate = await TemplateService.generate(limitOrgId);

    // Try to import 11 employees (exceeds trial tier max of 10)
    const rows = Array.from({ length: 11 }, () => validRow());
    const buffer = await buildWorkbookWithRows(limitTemplate, rows);

    const { EmployeeImportLimitExceededError } = await import(
      "../import.errors"
    );

    await expect(
      ImportService.importFromFile({
        buffer,
        organizationId: limitOrgId,
        userId: limitUserId,
      })
    ).rejects.toBeInstanceOf(EmployeeImportLimitExceededError);
  });

  test("allows import of CPF already used by a TERMINATED employee", async () => {
    const cpf = generateCpf();

    // Create an employee with this CPF directly in the DB, then terminate them
    const employeeId = `employee-${crypto.randomUUID()}`;
    await db.insert(schema.employees).values({
      id: employeeId,
      organizationId,
      name: "Terminated Employee",
      email: `terminated-${crypto.randomUUID().slice(0, 8)}@test.com`,
      mobile: "11999887766",
      birthDate: "1990-01-15",
      gender: "MALE",
      maritalStatus: "SINGLE",
      birthplace: "São Paulo",
      nationality: "Brasileiro",
      motherName: "Maria",
      cpf,
      identityCard: "123456789",
      pis: "12345678901",
      workPermitNumber: "1234567",
      workPermitSeries: "0001",
      street: "Rua Test",
      streetNumber: "1",
      neighborhood: "Centro",
      city: "São Paulo",
      state: "SP",
      zipCode: "01234567",
      hireDate: "2024-01-15",
      contractType: "CLT",
      salary: "5000",
      status: "TERMINATED",
      sectorId: (
        await db
          .select({ id: schema.sectors.id })
          .from(schema.sectors)
          .where(eq(schema.sectors.organizationId, organizationId))
          .limit(1)
      )[0].id,
      jobPositionId: (
        await db
          .select({ id: schema.jobPositions.id })
          .from(schema.jobPositions)
          .where(eq(schema.jobPositions.organizationId, organizationId))
          .limit(1)
      )[0].id,
      jobClassificationId: (
        await db
          .select({ id: schema.jobClassifications.id })
          .from(schema.jobClassifications)
          .where(eq(schema.jobClassifications.organizationId, organizationId))
          .limit(1)
      )[0].id,
      workShift: "FIVE_TWO",
      weeklyHours: "44",
      educationLevel: "BACHELOR",
      hasSpecialNeeds: false,
      hasChildren: false,
      createdBy: userId,
      updatedBy: userId,
    });

    // Import a new employee with the same CPF
    const rows = [validRow({ cpf })];
    const buffer = await buildWorkbookWithRows(templateBuffer, rows);

    const result = await ImportService.importFromFile({
      buffer,
      organizationId,
      userId,
    });

    expect(result.imported).toBe(1);
    expect(result.failed).toBe(0);
  });

  test("generates vacation acquisition periods for imported employees", async () => {
    const { registerEmployeeListeners } = await import(
      "@/modules/employees/hooks/listeners"
    );
    registerEmployeeListeners();

    const hireDate = "10/06/2024";
    const rows = [validRow({ hireDate }), validRow({ hireDate })];
    const buffer = await buildWorkbookWithRows(templateBuffer, rows);

    const result = await ImportService.importFromFile({
      buffer,
      organizationId,
      userId,
    });

    expect(result.imported).toBe(2);

    // Wait for async event handlers to complete
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Find the imported employees by checking recently created ones
    const recentEmployees = await db
      .select({ id: schema.employees.id })
      .from(schema.employees)
      .where(
        and(
          eq(schema.employees.organizationId, organizationId),
          eq(schema.employees.hireDate, "2024-06-10"),
          isNull(schema.employees.deletedAt)
        )
      );

    expect(recentEmployees.length).toBeGreaterThanOrEqual(2);
  });

  test("computes probation dates from hireDate for each imported employee", async () => {
    // Use a fresh org so the employee count starts at 0 (shared org accumulates
    // employees across tests and may be close to the tier limit).
    const probResult = await createTestUserWithOrganization({
      emailVerified: true,
      skipTrialCreation: true,
    });
    const probOrgId = probResult.organizationId;
    const probUserId = probResult.user.id;

    await createTestSector({
      organizationId: probOrgId,
      userId: probUserId,
      name: "Import Setor",
    });
    await createTestJobPosition({
      organizationId: probOrgId,
      userId: probUserId,
      name: "Import Cargo",
    });
    await createTestJobClassification({
      organizationId: probOrgId,
      userId: probUserId,
      name: "Import CBO",
    });
    await setupSubscription(probOrgId);

    const probTemplate = await TemplateService.generate(probOrgId);

    const rows = [
      validRow({
        name: "Empl A Probation",
        hireDate: "06/04/2025",
        cpf: generateCpf(),
        sectorId: "Import Setor",
        jobPositionId: "Import Cargo",
        jobClassificationId: "Import CBO",
      }),
      validRow({
        name: "Empl B Probation",
        hireDate: "03/03/2025",
        cpf: generateCpf(),
        sectorId: "Import Setor",
        jobPositionId: "Import Cargo",
        jobClassificationId: "Import CBO",
      }),
    ];
    const buffer = await buildWorkbookWithRows(probTemplate, rows);

    const result = await ImportService.importFromFile({
      buffer,
      organizationId: probOrgId,
      userId: probUserId,
    });

    expect(result.imported).toBe(2);
    expect(result.failed).toBe(0);

    const inserted = await db
      .select({
        name: schema.employees.name,
        hireDate: schema.employees.hireDate,
        p1: schema.employees.probation1ExpiryDate,
        p2: schema.employees.probation2ExpiryDate,
      })
      .from(schema.employees)
      .where(
        and(
          eq(schema.employees.organizationId, probOrgId),
          isNull(schema.employees.deletedAt)
        )
      );

    const a = inserted.find((e) => e.name === "Empl A Probation");
    const b = inserted.find((e) => e.name === "Empl B Probation");

    expect(a?.p1).toBe("2025-05-20");
    expect(a?.p2).toBe("2025-07-04");
    expect(b?.p1).toBe("2025-04-16");
    expect(b?.p2).toBe("2025-05-31");
  });
});
