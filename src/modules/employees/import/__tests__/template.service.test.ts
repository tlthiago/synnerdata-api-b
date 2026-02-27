import { describe, expect, test } from "bun:test";
import ExcelJS from "exceljs";
import { createTestBranch } from "@/test/helpers/branch";
import { createTestCostCenter } from "@/test/helpers/cost-center";
import { createTestJobClassification } from "@/test/helpers/job-classification";
import { createTestJobPosition } from "@/test/helpers/job-position";
import { createTestSector } from "@/test/helpers/sector";
import { createTestUserWithOrganization } from "@/test/helpers/user";
import {
  IMPORT_COLUMNS,
  SHEET_NAME_DATA,
  SHEET_NAME_EMPLOYEES,
} from "../import.constants";
import { TemplateService } from "../template.service";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function loadWorkbook(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  // @ts-expect-error — Bun's Buffer<ArrayBufferLike> vs Node's Buffer<ArrayBuffer>
  await wb.xlsx.load(buffer);
  return wb;
}

function getWorksheet(wb: ExcelJS.Workbook, name: string): ExcelJS.Worksheet {
  const ws = wb.getWorksheet(name);
  if (!ws) {
    throw new Error(`Worksheet "${name}" not found`);
  }
  return ws;
}

function columnLetter(colNum: number): string {
  let letter = "";
  let num = colNum;
  while (num > 0) {
    const remainder = (num - 1) % 26;
    letter = String.fromCharCode(65 + remainder) + letter;
    num = Math.floor((num - 1) / 26);
  }
  return letter;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("TemplateService.generate", () => {
  test("generates workbook with 3 sheets with correct names", async () => {
    const { organizationId, userId } = await createTestUserWithOrganization();

    await createTestSector({ organizationId, userId, name: "Setor A" });
    await createTestJobPosition({
      organizationId,
      userId,
      name: "Cargo A",
    });
    await createTestJobClassification({
      organizationId,
      userId,
      name: "CBO A",
    });

    const buffer = await TemplateService.generate(organizationId);
    const wb = await loadWorkbook(buffer);

    expect(wb.worksheets).toHaveLength(3);
    expect(wb.worksheets[0].name).toBe("Instrucoes");
    expect(wb.worksheets[1].name).toBe(SHEET_NAME_EMPLOYEES);
    expect(wb.worksheets[2].name).toBe(SHEET_NAME_DATA);
  });

  test("main sheet has correct headers matching IMPORT_COLUMNS with * suffix for required", async () => {
    const { organizationId, userId } = await createTestUserWithOrganization();

    await createTestSector({ organizationId, userId, name: "Setor B" });
    await createTestJobPosition({
      organizationId,
      userId,
      name: "Cargo B",
    });
    await createTestJobClassification({
      organizationId,
      userId,
      name: "CBO B",
    });

    const buffer = await TemplateService.generate(organizationId);
    const wb = await loadWorkbook(buffer);
    const ws = getWorksheet(wb, SHEET_NAME_EMPLOYEES);

    const headerRow = ws.getRow(1);

    for (let i = 0; i < IMPORT_COLUMNS.length; i++) {
      const col = IMPORT_COLUMNS[i];
      const expectedHeader = col.required ? `${col.header}*` : col.header;
      const cellValue = headerRow.getCell(i + 1).value;
      expect(cellValue).toBe(expectedHeader);
    }
  });

  test("main sheet header row is frozen", async () => {
    const { organizationId, userId } = await createTestUserWithOrganization();

    await createTestSector({ organizationId, userId, name: "Setor C" });
    await createTestJobPosition({
      organizationId,
      userId,
      name: "Cargo C",
    });
    await createTestJobClassification({
      organizationId,
      userId,
      name: "CBO C",
    });

    const buffer = await TemplateService.generate(organizationId);
    const wb = await loadWorkbook(buffer);
    const ws = getWorksheet(wb, SHEET_NAME_EMPLOYEES);

    const views = ws.views;
    expect(views).toHaveLength(1);
    expect(views[0].state).toBe("frozen");
    expect((views[0] as Record<string, unknown>).ySplit).toBe(1);
  });

  test("data sheet contains organization reference data", async () => {
    const { organizationId, userId } = await createTestUserWithOrganization();

    const sector = await createTestSector({
      organizationId,
      userId,
      name: "Financeiro",
    });
    const position = await createTestJobPosition({
      organizationId,
      userId,
      name: "Analista",
    });
    const classification = await createTestJobClassification({
      organizationId,
      userId,
      name: "Analista de Sistemas",
    });
    const branch = await createTestBranch({
      organizationId,
      userId,
      name: "Filial Centro",
    });
    const costCenter = await createTestCostCenter({
      organizationId,
      userId,
      name: "CC Operacional",
    });

    const buffer = await TemplateService.generate(organizationId);
    const wb = await loadWorkbook(buffer);
    const ws = getWorksheet(wb, SHEET_NAME_DATA);

    // Row 1 = headers
    expect(ws.getRow(1).getCell(1).value).toBe("Setores");
    expect(ws.getRow(1).getCell(2).value).toBe("Cargos");
    expect(ws.getRow(1).getCell(3).value).toBe("CBOs");
    expect(ws.getRow(1).getCell(4).value).toBe("Filiais");
    expect(ws.getRow(1).getCell(5).value).toBe("Centros de custo");

    // Row 2 = data
    expect(ws.getRow(2).getCell(1).value).toBe(sector.name);
    expect(ws.getRow(2).getCell(2).value).toBe(position.name);
    expect(ws.getRow(2).getCell(3).value).toBe(classification.name);
    expect(ws.getRow(2).getCell(4).value).toBe(branch.name);
    expect(ws.getRow(2).getCell(5).value).toBe(costCenter.name);
  });

  test("data sheet is veryHidden", async () => {
    const { organizationId, userId } = await createTestUserWithOrganization();

    await createTestSector({ organizationId, userId, name: "Setor D" });
    await createTestJobPosition({
      organizationId,
      userId,
      name: "Cargo D",
    });
    await createTestJobClassification({
      organizationId,
      userId,
      name: "CBO D",
    });

    const buffer = await TemplateService.generate(organizationId);
    const wb = await loadWorkbook(buffer);
    const ws = getWorksheet(wb, SHEET_NAME_DATA);

    expect(ws.state).toBe("veryHidden");
  });

  test("inline enum dropdowns are applied to correct columns", async () => {
    const { organizationId, userId } = await createTestUserWithOrganization();

    await createTestSector({ organizationId, userId, name: "Setor E" });
    await createTestJobPosition({
      organizationId,
      userId,
      name: "Cargo E",
    });
    await createTestJobClassification({
      organizationId,
      userId,
      name: "CBO E",
    });

    const buffer = await TemplateService.generate(organizationId);
    const wb = await loadWorkbook(buffer);
    const ws = getWorksheet(wb, SHEET_NAME_EMPLOYEES);

    const inlineColumns = IMPORT_COLUMNS.filter(
      (c) => c.dropdown?.type === "inline"
    );

    for (const col of inlineColumns) {
      const colIndex = IMPORT_COLUMNS.findIndex((c) => c.key === col.key) + 1;
      const colLetter = columnLetter(colIndex);

      // After round-trip, ExcelJS expands range validations into per-cell keys
      const sampleKey = `${colLetter}2`;
      const validations = (
        ws as unknown as {
          dataValidations: {
            model: Record<string, { type: string; formulae: string[] }>;
          };
        }
      ).dataValidations.model;
      const validation = validations[sampleKey];
      expect(validation).toBeDefined();
      expect(validation.type).toBe("list");

      if (col.dropdown?.type === "inline") {
        expect(validation.formulae).toEqual([`"${col.dropdown.values}"`]);
      }
    }
  });

  test("reference dropdowns point to Dados sheet", async () => {
    const { organizationId, userId } = await createTestUserWithOrganization();

    await createTestSector({ organizationId, userId, name: "Setor F" });
    await createTestJobPosition({
      organizationId,
      userId,
      name: "Cargo F",
    });
    await createTestJobClassification({
      organizationId,
      userId,
      name: "CBO F",
    });

    const buffer = await TemplateService.generate(organizationId);
    const wb = await loadWorkbook(buffer);
    const ws = getWorksheet(wb, SHEET_NAME_EMPLOYEES);

    const refColumns = IMPORT_COLUMNS.filter(
      (c) => c.dropdown?.type === "reference"
    );

    for (const col of refColumns) {
      const colIndex = IMPORT_COLUMNS.findIndex((c) => c.key === col.key) + 1;
      const colLetter = columnLetter(colIndex);

      // After round-trip, ExcelJS expands range validations into per-cell keys
      const sampleKey = `${colLetter}2`;
      const validations = (
        ws as unknown as {
          dataValidations: {
            model: Record<string, { type: string; formulae: string[] }>;
          };
        }
      ).dataValidations.model;
      const validation = validations[sampleKey];
      expect(validation).toBeDefined();
      expect(validation.type).toBe("list");

      if (col.dropdown?.type === "reference") {
        const expectedFormula = `${SHEET_NAME_DATA}!$${col.dropdown.refColumn}$2:$${col.dropdown.refColumn}$500`;
        expect(validation.formulae).toEqual([expectedFormula]);
      }
    }
  });
});
