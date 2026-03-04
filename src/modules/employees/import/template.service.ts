import { and, eq, isNull } from "drizzle-orm";
import ExcelJS from "exceljs";
import { db } from "@/db";
import { schema } from "@/db/schema";
import {
  IMPORT_COLUMNS,
  type ImportColumnDropdown,
  MAX_IMPORT_ROWS,
  SHEET_NAME_DATA,
  SHEET_NAME_EMPLOYEES,
} from "./import.constants";

// ── Named range mapping for reference dropdowns ─────────────────────────────
// Maps refColumn letter to { named range name, data array key }
const REFERENCE_COLUMNS: {
  refColumn: string;
  rangeName: string;
  dataKey:
    | "sectors"
    | "jobPositions"
    | "jobClassifications"
    | "branches"
    | "costCenters";
}[] = [
  { refColumn: "A", rangeName: "Setores", dataKey: "sectors" },
  { refColumn: "B", rangeName: "Funcoes", dataKey: "jobPositions" },
  { refColumn: "C", rangeName: "CBOs", dataKey: "jobClassifications" },
  { refColumn: "D", rangeName: "Filiais", dataKey: "branches" },
  { refColumn: "E", rangeName: "CentrosDeCusto", dataKey: "costCenters" },
];

// ── Style constants ─────────────────────────────────────────────────────────

const REQUIRED_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF548235" },
};

const REQUIRED_FONT: Partial<ExcelJS.Font> = {
  bold: true,
  color: { argb: "FFFFFFFF" },
};

const OPTIONAL_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFFFD966" },
};

const OPTIONAL_FONT: Partial<ExcelJS.Font> = {
  bold: true,
  color: { argb: "FF000000" },
};

// ── Service ─────────────────────────────────────────────────────────────────

export abstract class TemplateService {
  /**
   * Generates a 3-sheet .xlsx workbook for employee bulk import.
   * Sheet 1: Instructions — Sheet 2: Main data entry — Sheet 3: Hidden reference data
   */
  static async generate(organizationId: string): Promise<Buffer> {
    const [sectors, jobPositions, jobClassifications, branches, costCenters] =
      await Promise.all([
        db
          .select({ id: schema.sectors.id, name: schema.sectors.name })
          .from(schema.sectors)
          .where(
            and(
              eq(schema.sectors.organizationId, organizationId),
              isNull(schema.sectors.deletedAt)
            )
          )
          .orderBy(schema.sectors.name),
        db
          .select({
            id: schema.jobPositions.id,
            name: schema.jobPositions.name,
          })
          .from(schema.jobPositions)
          .where(
            and(
              eq(schema.jobPositions.organizationId, organizationId),
              isNull(schema.jobPositions.deletedAt)
            )
          )
          .orderBy(schema.jobPositions.name),
        db
          .select({
            id: schema.jobClassifications.id,
            name: schema.jobClassifications.name,
          })
          .from(schema.jobClassifications)
          .where(
            and(
              eq(schema.jobClassifications.organizationId, organizationId),
              isNull(schema.jobClassifications.deletedAt)
            )
          )
          .orderBy(schema.jobClassifications.name),
        db
          .select({ id: schema.branches.id, name: schema.branches.name })
          .from(schema.branches)
          .where(
            and(
              eq(schema.branches.organizationId, organizationId),
              isNull(schema.branches.deletedAt)
            )
          )
          .orderBy(schema.branches.name),
        db
          .select({
            id: schema.costCenters.id,
            name: schema.costCenters.name,
          })
          .from(schema.costCenters)
          .where(
            and(
              eq(schema.costCenters.organizationId, organizationId),
              isNull(schema.costCenters.deletedAt)
            )
          )
          .orderBy(schema.costCenters.name),
      ]);

    const workbook = new ExcelJS.Workbook();

    const entityData = {
      sectors,
      jobPositions,
      jobClassifications,
      branches,
      costCenters,
    };

    TemplateService.buildInstructionsSheet(workbook);
    // Data sheet must be built before Employees sheet so named ranges exist
    TemplateService.buildDataSheet(workbook, entityData);
    TemplateService.buildEmployeesSheet(workbook);

    return Buffer.from(await workbook.xlsx.writeBuffer()) as Buffer;
  }

  // ── Sheet 1: Instrucoes ─────────────────────────────────────────────────

  private static buildInstructionsSheet(workbook: ExcelJS.Workbook): void {
    const ws = workbook.addWorksheet("Instrucoes", {
      properties: { tabColor: { argb: "FF4472C4" } },
    });

    ws.getColumn(1).width = 80;

    const titleRow = ws.addRow(["Template de Importacao de Funcionarios"]);
    titleRow.getCell(1).font = { size: 16, bold: true };
    ws.addRow([]);

    const instructions = [
      '1. Preencha os dados dos funcionarios na aba "Funcionarios".',
      "2. Colunas com cabecalho verde (*) sao obrigatorias.",
      "3. Colunas com cabecalho amarelo sao opcionais.",
      "4. Use os valores do dropdown quando disponiveis.",
      "5. Datas devem estar no formato DD/MM/AAAA.",
      "6. Nao altere os cabecalhos nem a aba de Dados.",
      `7. Limite maximo de ${MAX_IMPORT_ROWS} funcionarios por importacao.`,
    ];

    for (const instruction of instructions) {
      ws.addRow([instruction]);
    }

    ws.addRow([]);

    // Color legend
    const legendRequired = ws.addRow(["Verde = Campo obrigatorio"]);
    legendRequired.getCell(1).fill = REQUIRED_FILL;
    legendRequired.getCell(1).font = REQUIRED_FONT;

    const legendOptional = ws.addRow(["Amarelo = Campo opcional"]);
    legendOptional.getCell(1).fill = OPTIONAL_FILL;
    legendOptional.getCell(1).font = OPTIONAL_FONT;
  }

  // ── Sheet 2: Funcionarios ───────────────────────────────────────────────

  private static buildEmployeesSheet(workbook: ExcelJS.Workbook): void {
    const ws = workbook.addWorksheet(SHEET_NAME_EMPLOYEES);

    // Set column widths and headers
    const headers: string[] = [];
    for (let i = 0; i < IMPORT_COLUMNS.length; i++) {
      const col = IMPORT_COLUMNS[i];
      ws.getColumn(i + 1).width = col.width;
      headers.push(col.required ? `${col.header}*` : col.header);
    }

    const headerRow = ws.addRow(headers);

    // Style headers
    for (let i = 0; i < IMPORT_COLUMNS.length; i++) {
      const col = IMPORT_COLUMNS[i];
      const cell = headerRow.getCell(i + 1);

      if (col.required) {
        cell.fill = REQUIRED_FILL;
        cell.font = REQUIRED_FONT;
      } else {
        cell.fill = OPTIONAL_FILL;
        cell.font = OPTIONAL_FONT;
      }
    }

    // Freeze header row
    ws.views = [{ state: "frozen", xSplit: 0, ySplit: 1 }];

    // Apply data validations to rows 2 through MAX_IMPORT_ROWS + 1
    TemplateService.applyDataValidations(ws);
  }

  // ── Data validations for Employees sheet ────────────────────────────────

  private static applyDataValidations(ws: ExcelJS.Worksheet): void {
    const lastDataRow = MAX_IMPORT_ROWS + 1;

    for (let i = 0; i < IMPORT_COLUMNS.length; i++) {
      const col = IMPORT_COLUMNS[i];
      if (!col.dropdown) {
        continue;
      }

      const colLetter = TemplateService.columnLetter(i + 1);

      if (col.dropdown.type === "inline") {
        // @ts-expect-error — dataValidations exists at runtime but is missing from @types/exceljs
        ws.dataValidations.add(`${colLetter}2:${colLetter}${lastDataRow}`, {
          type: "list",
          allowBlank: !col.required,
          formulae: [`"${col.dropdown.values}"`],
          showErrorMessage: true,
          errorTitle: "Valor invalido",
          error: `Selecione um valor valido para "${col.header}".`,
        });
      } else if (col.dropdown.type === "reference") {
        const rangeName = TemplateService.getRangeName(col.dropdown);
        if (rangeName) {
          // @ts-expect-error — dataValidations exists at runtime but is missing from @types/exceljs
          ws.dataValidations.add(`${colLetter}2:${colLetter}${lastDataRow}`, {
            type: "list",
            allowBlank: !col.required,
            formulae: [`${rangeName}`],
            showErrorMessage: true,
            errorTitle: "Valor invalido",
            error: `Selecione um valor valido para "${col.header}".`,
          });
        }
      }
    }
  }

  // ── Sheet 3: Dados (Hidden Reference Data) ─────────────────────────────

  private static buildDataSheet(
    workbook: ExcelJS.Workbook,
    data: {
      sectors: { id: string; name: string }[];
      jobPositions: { id: string; name: string }[];
      jobClassifications: { id: string; name: string }[];
      branches: { id: string; name: string }[];
      costCenters: { id: string; name: string }[];
    }
  ): void {
    const ws = workbook.addWorksheet(SHEET_NAME_DATA, {
      state: "veryHidden",
    });

    // Column headers (row 1)
    const dataHeaders = [
      "Setores",
      "Funções",
      "CBOs",
      "Filiais",
      "Centros de custo",
    ];
    ws.addRow(dataHeaders);

    // Data columns (row 2+)
    const columns = [
      data.sectors,
      data.jobPositions,
      data.jobClassifications,
      data.branches,
      data.costCenters,
    ];

    const maxRows = Math.max(...columns.map((c) => c.length), 0);

    for (let rowIdx = 0; rowIdx < maxRows; rowIdx++) {
      const rowValues: (string | null)[] = [];
      for (const column of columns) {
        rowValues.push(rowIdx < column.length ? column[rowIdx].name : null);
      }
      ws.addRow(rowValues);
    }

    // Register named ranges for each reference column
    // This avoids the ExcelJS bug with cross-sheet formula references (#2898)
    for (const ref of REFERENCE_COLUMNS) {
      const entityCount = data[ref.dataKey].length;
      if (entityCount > 0) {
        const lastRow = entityCount + 1; // +1 because row 1 is header
        workbook.definedNames.add(
          `'${SHEET_NAME_DATA}'!$${ref.refColumn}$2:$${ref.refColumn}$${lastRow}`,
          ref.rangeName
        );
      }
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  /**
   * Resolves a reference dropdown to its named range name.
   */
  private static getRangeName(dropdown: ImportColumnDropdown): string | null {
    if (dropdown.type !== "reference") {
      return null;
    }
    const ref = REFERENCE_COLUMNS.find(
      (r) => r.refColumn === dropdown.refColumn
    );
    return ref?.rangeName ?? null;
  }

  /**
   * Converts a 1-based column number to an Excel column letter (e.g. 1 -> "A", 27 -> "AA").
   */
  private static columnLetter(colNum: number): string {
    let letter = "";
    let num = colNum;
    while (num > 0) {
      const remainder = (num - 1) % 26;
      letter = String.fromCharCode(65 + remainder) + letter;
      num = Math.floor((num - 1) / 26);
    }
    return letter;
  }
}
