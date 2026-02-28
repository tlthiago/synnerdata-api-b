import { beforeAll, describe, expect, test } from "bun:test";
import ExcelJS from "exceljs";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { generateCpf } from "@/test/helpers/faker";
import { createTestJobClassification } from "@/test/helpers/job-classification";
import { createTestJobPosition } from "@/test/helpers/job-position";
import { createTestSector } from "@/test/helpers/sector";
import { createTestUserWithOrganization } from "@/test/helpers/user";
import { IMPORT_COLUMNS, SHEET_NAME_EMPLOYEES } from "../import.constants";

const BASE_URL = env.API_URL;

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

async function createTestDependencies(organizationId: string, userId: string) {
  await setupSubscription(organizationId);

  const sector = await createTestSector({ organizationId, userId });
  const jobPosition = await createTestJobPosition({ organizationId, userId });
  const jobClassification = await createTestJobClassification({
    organizationId,
    userId,
  });

  return {
    sectorName: sector.name,
    jobPositionName: jobPosition.name,
    jobClassificationName: jobClassification.name,
  };
}

function validRow(
  deps: {
    sectorName: string;
    jobPositionName: string;
    jobClassificationName: string;
  },
  overrides?: Record<string, unknown>
) {
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
    sectorId: deps.sectorName,
    jobPositionId: deps.jobPositionName,
    jobClassificationId: deps.jobClassificationName,
    workShift: "5x2",
    weeklyHours: 44,
    educationLevel: "Graduação",
    hasSpecialNeeds: "Não",
    hasChildren: "Não",
    ...overrides,
  };
}

async function fillTemplate(
  templateBuffer: Buffer,
  rows: Record<string, unknown>[]
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  // @ts-expect-error — Bun's Buffer<ArrayBufferLike> vs Node's Buffer<ArrayBuffer>
  await workbook.xlsx.load(templateBuffer);
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /v1/employees/import/template", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/employees/import/template`)
    );

    expect(response.status).toBe(401);
  });

  test("should return xlsx template", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
        skipTrialCreation: true,
      });

    await createTestDependencies(organizationId, user.id);

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/employees/import/template`, {
        headers: { ...headers },
      })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="template-funcionarios.xlsx"'
    );

    const arrayBuffer = await response.arrayBuffer();
    expect(arrayBuffer.byteLength).toBeGreaterThan(0);
  });
});

describe("POST /v1/employees/import", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should reject unauthenticated requests", async () => {
    const formData = new FormData();
    formData.append(
      "file",
      new Blob(["fake"], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
      "employees.xlsx"
    );

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/employees/import`, {
        method: "POST",
        body: formData,
      })
    );

    expect(response.status).toBe(401);
  });

  test("should import valid employees", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
        skipTrialCreation: true,
      });

    const deps = await createTestDependencies(organizationId, user.id);

    // 1. Download template
    const templateResponse = await app.handle(
      new Request(`${BASE_URL}/v1/employees/import/template`, {
        headers: { ...headers },
      })
    );
    expect(templateResponse.status).toBe(200);
    const templateBuffer = Buffer.from(await templateResponse.arrayBuffer());

    // 2. Fill template with 1 valid row
    const row = validRow(deps);
    const fileBuffer = await fillTemplate(templateBuffer, [row]);

    // 3. Upload
    const formData = new FormData();
    formData.append(
      "file",
      new Blob([fileBuffer as BlobPart], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
      "employees.xlsx"
    );

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/employees/import`, {
        method: "POST",
        headers: { ...headers },
        body: formData,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.total).toBe(1);
    expect(body.data.imported).toBe(1);
    expect(body.data.failed).toBe(0);
    expect(body.data.errors).toHaveLength(0);
  });

  test("should report errors for invalid rows", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
        skipTrialCreation: true,
      });

    const deps = await createTestDependencies(organizationId, user.id);

    // 1. Download template
    const templateResponse = await app.handle(
      new Request(`${BASE_URL}/v1/employees/import/template`, {
        headers: { ...headers },
      })
    );
    expect(templateResponse.status).toBe(200);
    const templateBuffer = Buffer.from(await templateResponse.arrayBuffer());

    // 2. Fill template with an invalid CPF row
    const row = validRow(deps, { cpf: "00000000000" });
    const fileBuffer = await fillTemplate(templateBuffer, [row]);

    // 3. Upload
    const formData = new FormData();
    formData.append(
      "file",
      new Blob([fileBuffer as BlobPart], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
      "employees.xlsx"
    );

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/employees/import`, {
        method: "POST",
        headers: { ...headers },
        body: formData,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.total).toBe(1);
    expect(body.data.imported).toBe(0);
    expect(body.data.failed).toBeGreaterThanOrEqual(1);

    const cpfError = body.data.errors.find(
      (e: { field: string }) => e.field === "cpf"
    );
    expect(cpfError).toBeDefined();
  });
});
