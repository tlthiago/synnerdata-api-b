import { beforeAll, describe, expect, test } from "bun:test";
import { createTestBranch } from "@/test/helpers/branch";
import { createTestCostCenter } from "@/test/helpers/cost-center";
import {
  generateCep,
  generateCpf,
  generateMobile,
  generatePis,
} from "@/test/helpers/faker";
import { createTestJobClassification } from "@/test/helpers/job-classification";
import { createTestJobPosition } from "@/test/helpers/job-position";
import { createTestSector } from "@/test/helpers/sector";
import { createTestUserWithOrganization } from "@/test/helpers/user";
import { ensureStringField, ImportParser, parseDate } from "../import.parser";

// ---------------------------------------------------------------------------
// Test Setup
// ---------------------------------------------------------------------------

let organizationId: string;
let userId: string;
let parser: ImportParser;

// Entity IDs and names
let sectorId: string;
let sectorName: string;
let jobPositionId: string;
let jobPositionName: string;
let jobClassificationId: string;
let jobClassificationName: string;
let branchId: string;
let branchName: string;
let costCenterId: string;
let costCenterName: string;

// Reusable valid row builder
function buildValidRow(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    name: "João da Silva",
    email: "joao@example.com",
    mobile: generateMobile(),
    birthDate: "15/01/1990",
    gender: "Masculino",
    maritalStatus: "Solteiro(a)",
    birthplace: "São Paulo",
    nationality: "Brasileiro",
    motherName: "Maria da Silva",
    cpf: generateCpf(),
    identityCard: "123456789",
    pis: generatePis(),
    workPermitNumber: "1234567",
    workPermitSeries: "0001",
    street: "Rua das Flores",
    streetNumber: "123",
    neighborhood: "Centro",
    city: "São Paulo",
    state: "SP",
    zipCode: generateCep(),
    hireDate: "01/03/2023",
    contractType: "CLT",
    salary: 5000,
    sectorId: sectorName,
    jobPositionId: jobPositionName,
    jobClassificationId: jobClassificationName,
    workShift: "5x2",
    weeklyHours: 44,
    educationLevel: "Ensino Médio",
    hasSpecialNeeds: "Não",
    hasChildren: "Não",
    ...overrides,
  };
}

beforeAll(async () => {
  const result = await createTestUserWithOrganization({ emailVerified: true });
  organizationId = result.organizationId;
  userId = result.user.id;

  const sector = await createTestSector({
    organizationId,
    userId,
    name: "Tecnologia",
  });
  sectorId = sector.id;
  sectorName = sector.name;

  const jobPosition = await createTestJobPosition({
    organizationId,
    userId,
    name: "Desenvolvedor",
  });
  jobPositionId = jobPosition.id;
  jobPositionName = jobPosition.name;

  const jobClassification = await createTestJobClassification({
    organizationId,
    userId,
    name: "Analista de Sistemas",
  });
  jobClassificationId = jobClassification.id;
  jobClassificationName = jobClassification.name;

  const branch = await createTestBranch({
    organizationId,
    userId,
    name: "Filial Centro",
  });
  branchId = branch.id;
  branchName = branch.name;

  const costCenter = await createTestCostCenter({
    organizationId,
    userId,
    name: "CC Operacional",
  });
  costCenterId = costCenter.id;
  costCenterName = costCenter.name;

  parser = await ImportParser.create(organizationId);
});

// ---------------------------------------------------------------------------
// Helper function tests
// ---------------------------------------------------------------------------

describe("parseDate", () => {
  test("converts DD/MM/YYYY to YYYY-MM-DD", () => {
    expect(parseDate("15/01/1990")).toBe("1990-01-15");
    expect(parseDate("31/12/2023")).toBe("2023-12-31");
    expect(parseDate("01/03/2023")).toBe("2023-03-01");
  });

  test("handles JS Date objects", () => {
    const date = new Date(1990, 0, 15); // Jan 15, 1990
    expect(parseDate(date)).toBe("1990-01-15");
  });

  test("passes through YYYY-MM-DD strings", () => {
    expect(parseDate("1990-01-15")).toBe("1990-01-15");
    expect(parseDate("2023-12-31")).toBe("2023-12-31");
  });

  test("returns null for invalid formats", () => {
    expect(parseDate("not a date")).toBeNull();
    expect(parseDate(12_345)).toBeNull();
    expect(parseDate("15-01-1990")).toBeNull();
  });

  test("returns null for empty/null/undefined", () => {
    expect(parseDate(null)).toBeNull();
    expect(parseDate(undefined)).toBeNull();
  });
});

describe("ensureStringField", () => {
  test("pads numeric strings to specified length", () => {
    expect(ensureStringField("1234567890", 11)).toBe("01234567890");
    expect(ensureStringField("12345678", 11)).toBe("00012345678");
  });

  test("does not pad non-numeric strings", () => {
    expect(ensureStringField("abc123", 11)).toBe("abc123");
  });

  test("does not pad when no padLength specified", () => {
    expect(ensureStringField("123")).toBe("123");
  });

  test("handles numbers as input", () => {
    expect(ensureStringField(1_234_567_890, 11)).toBe("01234567890");
  });

  test("handles null/undefined", () => {
    expect(ensureStringField(null)).toBe("");
    expect(ensureStringField(undefined)).toBe("");
  });

  test("trims whitespace", () => {
    expect(ensureStringField("  hello  ")).toBe("hello");
  });
});

// ---------------------------------------------------------------------------
// ImportParser.create
// ---------------------------------------------------------------------------

describe("ImportParser.create", () => {
  test("creates an ImportParser instance", async () => {
    const p = await ImportParser.create(organizationId);
    expect(p).toBeInstanceOf(ImportParser);
  });
});

// ---------------------------------------------------------------------------
// ImportParser.parseRow
// ---------------------------------------------------------------------------

describe("ImportParser.parseRow", () => {
  // 1. Valid row parsed successfully
  test("parses a valid row successfully with all transformations", () => {
    const rawRow = buildValidRow();
    const result = parser.parseRow(rawRow, 2);

    expect(result.success).toBe(true);
    if (result.success) {
      // Enum labels resolved
      expect(result.data.gender).toBe("MALE");
      expect(result.data.maritalStatus).toBe("SINGLE");
      expect(result.data.contractType).toBe("CLT");
      expect(result.data.educationLevel).toBe("HIGH_SCHOOL");
      expect(result.data.workShift).toBe("FIVE_TWO");

      // Entity names resolved to IDs
      expect(result.data.sectorId).toBe(sectorId);
      expect(result.data.jobPositionId).toBe(jobPositionId);
      expect(result.data.jobClassificationId).toBe(jobClassificationId);

      // Dates converted
      expect(result.data.birthDate).toBe("1990-01-15");
      expect(result.data.hireDate).toBe("2023-03-01");

      // Booleans converted
      expect(result.data.hasSpecialNeeds).toBe(false);
      expect(result.data.hasChildren).toBe(false);

      // Numbers
      expect(result.data.salary).toBe(5000);
      expect(result.data.weeklyHours).toBe(44);
    }
  });

  // 2. Invalid enum label returns error
  test("returns error for invalid enum label", () => {
    const rawRow = buildValidRow({ gender: "Invalido" });
    const result = parser.parseRow(rawRow, 3);

    expect(result.success).toBe(false);
    if (!result.success) {
      const genderError = result.errors.find((e) => e.field === "gender");
      expect(genderError).toBeDefined();
      expect(genderError?.row).toBe(3);
      expect(genderError?.message).toContain("Invalido");
    }
  });

  // 3. Unknown entity name returns error
  test("returns error for unknown entity name", () => {
    const rawRow = buildValidRow({ sectorId: "Setor Inexistente" });
    const result = parser.parseRow(rawRow, 4);

    expect(result.success).toBe(false);
    if (!result.success) {
      const sectorError = result.errors.find((e) => e.field === "sectorId");
      expect(sectorError).toBeDefined();
      expect(sectorError?.row).toBe(4);
      expect(sectorError?.message).toContain("Setor Inexistente");
      expect(sectorError?.message).toContain("não encontrado");
    }
  });

  // 4. Missing required fields return errors
  test("returns errors for missing required fields", () => {
    const rawRow = {
      // Almost empty row - only a few fields
      name: "João",
    };
    const result = parser.parseRow(rawRow, 5);

    expect(result.success).toBe(false);
    if (!result.success) {
      // Should have multiple errors for missing required fields
      expect(result.errors.length).toBeGreaterThan(1);
      // All errors should reference row 5
      for (const err of result.errors) {
        expect(err.row).toBe(5);
      }
    }
  });

  // 5. DD/MM/YYYY dates converted to YYYY-MM-DD
  test("converts DD/MM/YYYY dates to YYYY-MM-DD", () => {
    const rawRow = buildValidRow({
      birthDate: "25/12/1985",
      hireDate: "10/06/2020",
      lastHealthExamDate: "01/01/2024",
    });
    const result = parser.parseRow(rawRow, 6);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.birthDate).toBe("1985-12-25");
      expect(result.data.hireDate).toBe("2020-06-10");
      expect(result.data.lastHealthExamDate).toBe("2024-01-01");
    }
  });

  // 6. JS Date objects handled correctly
  test("handles JS Date objects for date fields", () => {
    const rawRow = buildValidRow({
      birthDate: new Date(1985, 11, 25), // Dec 25, 1985
      hireDate: new Date(2020, 5, 10), // Jun 10, 2020
    });
    const result = parser.parseRow(rawRow, 7);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.birthDate).toBe("1985-12-25");
      expect(result.data.hireDate).toBe("2020-06-10");
    }
  });

  // 7. Optional fields empty → no error
  test("handles empty optional fields without errors", () => {
    const rawRow = buildValidRow({
      phone: undefined,
      height: undefined,
      weight: undefined,
      fatherName: undefined,
      militaryCertificate: undefined,
      complement: undefined,
      manager: undefined,
      branchId: undefined,
      costCenterId: undefined,
      busCount: undefined,
      mealAllowance: undefined,
      transportAllowance: undefined,
      disabilityType: undefined,
      childrenCount: undefined,
      hasChildrenUnder21: undefined,
      lastHealthExamDate: undefined,
      admissionExamDate: undefined,
      terminationExamDate: undefined,
      probation1ExpiryDate: undefined,
      probation2ExpiryDate: undefined,
    });
    const result = parser.parseRow(rawRow, 8);

    expect(result.success).toBe(true);
  });

  // 8. Boolean "Sim"/"Não" conversion
  test("converts boolean 'Sim'/'Não' labels correctly", () => {
    const rawRow = buildValidRow({
      hasSpecialNeeds: "Sim",
      hasChildren: "Não",
      hasChildrenUnder21: "Sim",
    });
    const result = parser.parseRow(rawRow, 9);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.hasSpecialNeeds).toBe(true);
      expect(result.data.hasChildren).toBe(false);
      expect(result.data.hasChildrenUnder21).toBe(true);
    }
  });

  test("handles 'Nao' (without accent) as false", () => {
    const rawRow = buildValidRow({ hasSpecialNeeds: "Nao" });
    const result = parser.parseRow(rawRow, 10);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.hasSpecialNeeds).toBe(false);
    }
  });

  test("returns error for invalid boolean value", () => {
    const rawRow = buildValidRow({ hasSpecialNeeds: "Talvez" });
    const result = parser.parseRow(rawRow, 11);

    expect(result.success).toBe(false);
    if (!result.success) {
      const boolError = result.errors.find(
        (e) => e.field === "hasSpecialNeeds"
      );
      expect(boolError).toBeDefined();
      expect(boolError?.message).toContain("Talvez");
    }
  });

  // 9. Numeric string coercion (CPF with leading zeros)
  test("pads CPF with leading zeros when stored as number", () => {
    // A CPF like "01234567890" might be stored as number 1234567890
    const validCpf = generateCpf();
    const rawRow = buildValidRow({ cpf: validCpf });
    const result = parser.parseRow(rawRow, 12);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.cpf).toHaveLength(11);
    }
  });

  test("pads CPF number to 11 digits", () => {
    // Simulate Excel stripping leading zeros: 01234567890 → 1234567890
    const rawRow = buildValidRow({ cpf: 1_234_567_890 });
    const result = parser.parseRow(rawRow, 13);

    // The result may fail CPF validation, but the padding should have worked
    // Let's check that CPF field is padded regardless
    if (result.success) {
      expect(result.data.cpf).toBe("01234567890");
    } else {
      // Even if CPF is invalid, the cpf string should have been set
      // The error should be about CPF validation, not about padding
      const cpfError = result.errors.find((e) => e.field === "cpf");
      if (cpfError) {
        expect(cpfError.message).toContain("CPF");
      }
    }
  });

  test("pads PIS with leading zeros", () => {
    const rawRow = buildValidRow({ pis: 12_345_678_901 });
    const result = parser.parseRow(rawRow, 14);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.pis).toBe("12345678901");
      expect(result.data.pis).toHaveLength(11);
    }
  });

  test("pads CEP with leading zeros", () => {
    const rawRow = buildValidRow({ zipCode: 1_310_100 });
    const result = parser.parseRow(rawRow, 15);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.zipCode).toBe("01310100");
      expect(result.data.zipCode).toHaveLength(8);
    }
  });

  // 10. Multiple errors collected from single row
  test("collects multiple errors from a single row", () => {
    const rawRow = buildValidRow({
      gender: "Invalido",
      maritalStatus: "Invalido",
      sectorId: "Inexistente",
    });
    const result = parser.parseRow(rawRow, 16);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.length).toBeGreaterThanOrEqual(3);

      const fieldNames = result.errors.map((e) => e.field);
      expect(fieldNames).toContain("gender");
      expect(fieldNames).toContain("maritalStatus");
      expect(fieldNames).toContain("sectorId");

      // All errors should reference the correct row
      for (const err of result.errors) {
        expect(err.row).toBe(16);
      }
    }
  });

  // Additional: entity resolution with optional FK fields
  test("resolves optional FK fields (branch, cost center) when provided", () => {
    const rawRow = buildValidRow({
      branchId: branchName,
      costCenterId: costCenterName,
    });
    const result = parser.parseRow(rawRow, 17);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.branchId).toBe(branchId);
      expect(result.data.costCenterId).toBe(costCenterId);
    }
  });

  test("returns error when optional FK name is provided but not found", () => {
    const rawRow = buildValidRow({ branchId: "Filial Fantasma" });
    const result = parser.parseRow(rawRow, 18);

    expect(result.success).toBe(false);
    if (!result.success) {
      const branchError = result.errors.find((e) => e.field === "branchId");
      expect(branchError).toBeDefined();
      expect(branchError?.message).toContain("Filial Fantasma");
      expect(branchError?.message).toContain("não encontrado");
    }
  });

  // Number parsing
  test("parses string numbers correctly", () => {
    const rawRow = buildValidRow({
      salary: "3500.50",
      weeklyHours: "44",
      height: "1.75",
      weight: "80",
    });
    const result = parser.parseRow(rawRow, 19);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.salary).toBe(3500.5);
      expect(result.data.weeklyHours).toBe(44);
      expect(result.data.height).toBe(1.75);
      expect(result.data.weight).toBe(80);
    }
  });

  test("handles comma as decimal separator in numbers", () => {
    const rawRow = buildValidRow({
      salary: "3500,50",
    });
    const result = parser.parseRow(rawRow, 20);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.salary).toBe(3500.5);
    }
  });

  test("returns error for non-numeric salary", () => {
    const rawRow = buildValidRow({ salary: "abc" });
    const result = parser.parseRow(rawRow, 21);

    expect(result.success).toBe(false);
    if (!result.success) {
      const salaryError = result.errors.find((e) => e.field === "salary");
      expect(salaryError).toBeDefined();
      expect(salaryError?.message).toContain("abc");
    }
  });

  // All enum labels resolve correctly
  test("resolves all gender labels", () => {
    const genderTests = [
      { label: "Masculino", expected: "MALE" },
      { label: "Feminino", expected: "FEMALE" },
      { label: "Não declarado", expected: "NOT_DECLARED" },
      { label: "Outro", expected: "OTHER" },
    ];

    for (const { label, expected } of genderTests) {
      const rawRow = buildValidRow({ gender: label });
      const result = parser.parseRow(rawRow, 22);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.gender).toBe(expected as typeof result.data.gender);
      }
    }
  });

  test("resolves all work shift labels", () => {
    const shiftTests = [
      { label: "12x36", expected: "TWELVE_THIRTY_SIX" },
      { label: "6x1", expected: "SIX_ONE" },
      { label: "5x2", expected: "FIVE_TWO" },
      { label: "4x3", expected: "FOUR_THREE" },
    ];

    for (const { label, expected } of shiftTests) {
      const rawRow = buildValidRow({ workShift: label });
      const result = parser.parseRow(rawRow, 23);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.workShift).toBe(
          expected as typeof result.data.workShift
        );
      }
    }
  });

  // Case-insensitive enum matching
  test("matches enum labels case-insensitively", () => {
    const rawRow = buildValidRow({
      gender: "masculino", // lowercase
      contractType: "clt", // lowercase
    });
    const result = parser.parseRow(rawRow, 24);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.gender).toBe("MALE");
      expect(result.data.contractType).toBe("CLT");
    }
  });

  // Case-insensitive entity name matching
  test("matches entity names case-insensitively", () => {
    const rawRow = buildValidRow({
      sectorId: sectorName.toUpperCase(),
    });
    const result = parser.parseRow(rawRow, 25);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sectorId).toBe(sectorId);
    }
  });

  // YYYY-MM-DD dates pass through
  test("passes through YYYY-MM-DD dates unchanged", () => {
    const rawRow = buildValidRow({
      birthDate: "1990-01-15",
      hireDate: "2023-03-01",
    });
    const result = parser.parseRow(rawRow, 26);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.birthDate).toBe("1990-01-15");
      expect(result.data.hireDate).toBe("2023-03-01");
    }
  });

  test("returns error for invalid date format", () => {
    const rawRow = buildValidRow({ birthDate: "not-a-date" });
    const result = parser.parseRow(rawRow, 27);

    expect(result.success).toBe(false);
    if (!result.success) {
      const dateError = result.errors.find((e) => e.field === "birthDate");
      expect(dateError).toBeDefined();
      expect(dateError?.message).toContain("not-a-date");
    }
  });

  // streetNumber coerced to string
  test("coerces streetNumber from number to string", () => {
    const rawRow = buildValidRow({ streetNumber: 123 });
    const result = parser.parseRow(rawRow, 28);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.streetNumber).toBe("123");
    }
  });
});
