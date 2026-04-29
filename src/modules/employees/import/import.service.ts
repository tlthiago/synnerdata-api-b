import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import ExcelJS from "exceljs";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { AuditService } from "@/modules/audit/audit.service";
import type { CreateEmployee } from "@/modules/employees/employee.model";
import { computeProbationDates } from "@/modules/employees/probation";
import { LimitsService } from "@/modules/payments/limits/limits.service";
import {
  FIELD_KEY_TO_HEADER,
  IMPORT_COLUMNS,
  MAX_IMPORT_ROWS,
  SHEET_NAME_EMPLOYEES,
} from "./import.constants";
import {
  EmployeeImportEmptyFileError,
  EmployeeImportFileTooLargeError,
  EmployeeImportInvalidFileError,
  EmployeeImportLimitExceededError,
} from "./import.errors";
import type { ImportInput, ImportResult, ImportRowError } from "./import.model";
import { ImportParser } from "./import.parser";

// ── Types ───────────────────────────────────────────────────────────────────

type ValidRow = {
  rowNumber: number;
  data: CreateEmployee;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extracts the primitive value from an ExcelJS cell value.
 * Excel auto-converts emails/URLs to hyperlink objects like:
 *   { text: "email@example.com", hyperlink: "mailto:email@example.com" }
 * and rich text to: { richText: [{ text: "..." }, ...] }
 * This function unwraps those to plain strings.
 */
function unwrapCellValue(value: ExcelJS.CellValue): ExcelJS.CellValue {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === "object" && !(value instanceof Date)) {
    // Hyperlink: { text: string, hyperlink: string }
    if ("text" in value && "hyperlink" in value) {
      return (value as { text: string }).text;
    }

    // Rich text: { richText: [{ text: string }, ...] }
    if ("richText" in value) {
      const parts = (value as { richText: { text: string }[] }).richText;
      return parts.map((p) => p.text).join("");
    }

    // Formula result: { result: value, formula: string }
    if ("result" in value) {
      return (value as { result: ExcelJS.CellValue }).result;
    }
  }

  return value;
}

// ── Service ─────────────────────────────────────────────────────────────────

export abstract class ImportService {
  /**
   * Imports employees from an Excel file buffer.
   *
   * Flow:
   * 1. Load workbook and find "Funcionários" sheet
   * 2. Extract data rows (skip header row 1)
   * 3. Validate row count (empty / too large)
   * 4. Parse each row with ImportParser
   * 5. Deduplicate CPFs within file
   * 6. Check CPF uniqueness against DB
   * 7. Check employee plan limit
   * 8. Batch insert valid rows
   * 9. Audit log
   */
  static async importFromFile(input: ImportInput): Promise<ImportResult> {
    const { buffer, organizationId, userId } = input;

    // 1. Load workbook
    const workbook = new ExcelJS.Workbook();
    // @ts-expect-error — Bun's Buffer<ArrayBufferLike> vs Node's Buffer<ArrayBuffer>
    await workbook.xlsx.load(buffer);

    const sheet = workbook.getWorksheet(SHEET_NAME_EMPLOYEES);
    if (!sheet) {
      throw new EmployeeImportInvalidFileError(
        "Aba 'Funcionários' não encontrada"
      );
    }

    // 2. Extract data rows as objects
    const rows: { rowNumber: number; data: Record<string, unknown> }[] = [];
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) {
        return; // skip header
      }
      const rowData: Record<string, unknown> = {};
      for (const [i, col] of IMPORT_COLUMNS.entries()) {
        const cell = row.getCell(i + 1);
        rowData[col.key] = unwrapCellValue(cell.value);
      }
      rows.push({ rowNumber, data: rowData });
    });

    // 3. Validate row count
    if (rows.length === 0) {
      throw new EmployeeImportEmptyFileError();
    }

    if (rows.length > MAX_IMPORT_ROWS) {
      throw new EmployeeImportFileTooLargeError(rows.length, MAX_IMPORT_ROWS);
    }

    // 4. Parse each row
    const parser = await ImportParser.create(organizationId);
    const errors: ImportRowError[] = [];
    let validRows: ValidRow[] = [];

    for (const row of rows) {
      const result = parser.parseRow(row.data, row.rowNumber);
      if (result.success) {
        validRows.push({ rowNumber: row.rowNumber, data: result.data });
      } else {
        errors.push(...result.errors);
      }
    }

    // 5. Deduplicate CPFs within file (first occurrence wins)
    validRows = ImportService.deduplicateCpfs(validRows, errors);

    // 6. Check CPF uniqueness against DB
    validRows = await ImportService.checkCpfsAgainstDb(
      validRows,
      errors,
      organizationId
    );

    // 7. Check employee plan limit
    if (validRows.length > 0) {
      const { current, limit } =
        await LimitsService.checkEmployeeLimit(organizationId);
      if (current + validRows.length > limit) {
        throw new EmployeeImportLimitExceededError(
          validRows.length,
          current,
          limit
        );
      }
    }

    // 8. Batch insert valid rows
    const insertValues: {
      id: string;
      organizationId: string;
      hireDate: string;
      [key: string]: unknown;
    }[] = [];

    if (validRows.length > 0) {
      for (const row of validRows) {
        insertValues.push({
          id: `employee-${crypto.randomUUID()}`,
          organizationId,
          ...row.data,
          // Convert numerics to strings for decimal columns
          height: row.data.height?.toString(),
          weight: row.data.weight?.toString(),
          salary: row.data.salary.toString(),
          weeklyHours: row.data.weeklyHours.toString(),
          mealAllowance: row.data.mealAllowance?.toString(),
          transportAllowance: row.data.transportAllowance?.toString(),
          healthInsurance: row.data.healthInsurance?.toString(),
          latitude: row.data.latitude?.toString(),
          longitude: row.data.longitude?.toString(),
          ...computeProbationDates(row.data.hireDate),
          status: "ACTIVE" as const,
          createdBy: userId,
          updatedBy: userId,
        });
      }

      await db
        .insert(schema.employees)
        .values(insertValues as (typeof schema.employees.$inferInsert)[]);

      // 8b. Emit employee.created events sequentially
      const { EmployeeHooks } = await import("@/modules/employees/hooks");
      for (const row of insertValues) {
        EmployeeHooks.emit("employee.created", {
          employeeId: row.id,
          organizationId,
          hireDate: row.hireDate,
        });
      }
    }

    // 9. Audit log
    await AuditService.log({
      action: "create",
      resource: "employee",
      userId,
      organizationId,
      changes: {
        after: { imported: validRows.length, failed: errors.length },
      },
    });

    // 10. Translate field keys to PT-BR headers for user-facing errors
    const translatedErrors = errors.map((err) => ({
      ...err,
      field: FIELD_KEY_TO_HEADER[err.field] ?? err.field,
    }));

    return {
      total: rows.length,
      imported: validRows.length,
      failed: translatedErrors.length,
      errors: translatedErrors,
    };
  }

  /**
   * Removes duplicate CPFs within the file. First occurrence wins;
   * subsequent duplicates are moved to errors.
   */
  private static deduplicateCpfs(
    validRows: ValidRow[],
    errors: ImportRowError[]
  ): ValidRow[] {
    const seenCpfs = new Set<string>();
    const deduped: ValidRow[] = [];

    for (const row of validRows) {
      const cpf = row.data.cpf;
      if (seenCpfs.has(cpf)) {
        errors.push({
          row: row.rowNumber,
          field: "cpf",
          message: "CPF duplicado no arquivo",
        });
      } else {
        seenCpfs.add(cpf);
        deduped.push(row);
      }
    }

    return deduped;
  }

  /**
   * Checks valid rows' CPFs against existing employees in the DB.
   * Rows with CPFs that already exist are moved to errors.
   */
  private static async checkCpfsAgainstDb(
    validRows: ValidRow[],
    errors: ImportRowError[],
    organizationId: string
  ): Promise<ValidRow[]> {
    if (validRows.length === 0) {
      return [];
    }

    const cpfs = validRows.map((r) => r.data.cpf);
    const existing = await db
      .select({ cpf: schema.employees.cpf })
      .from(schema.employees)
      .where(
        and(
          eq(schema.employees.organizationId, organizationId),
          inArray(schema.employees.cpf, cpfs),
          isNull(schema.employees.deletedAt),
          ne(schema.employees.status, "TERMINATED")
        )
      );

    const existingCpfs = new Set(existing.map((e) => e.cpf));

    if (existingCpfs.size === 0) {
      return validRows;
    }

    const remaining: ValidRow[] = [];
    for (const row of validRows) {
      if (existingCpfs.has(row.data.cpf)) {
        errors.push({
          row: row.rowNumber,
          field: "cpf",
          message: "CPF já cadastrado na organização",
        });
      } else {
        remaining.push(row);
      }
    }

    return remaining;
  }
}
