// ---------------------------------------------------------------------------
// Employee Import — Row Parser & Validator
// ---------------------------------------------------------------------------

import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import {
  type CreateEmployee,
  createEmployeeSchema,
} from "@/modules/employees/employee.model";
import {
  BOOLEAN_LABELS,
  buildReverseMap,
  CONTRACT_TYPE_LABELS,
  DISABILITY_TYPE_LABELS,
  EDUCATION_LEVEL_LABELS,
  GENDER_LABELS,
  MARITAL_STATUS_LABELS,
  WORK_SHIFT_LABELS,
} from "./import.constants";

// ── Types ───────────────────────────────────────────────────────────────────

export type ImportRowError = {
  row: number;
  field: string;
  message: string;
};

export type ParseRowResult =
  | { success: true; data: CreateEmployee }
  | { success: false; errors: ImportRowError[] };

// ── Entity map type ─────────────────────────────────────────────────────────

type EntityMap = Map<string, string>;

type EntityMaps = {
  sectorMap: EntityMap;
  jobPositionMap: EntityMap;
  jobClassificationMap: EntityMap;
  branchMap: EntityMap;
  costCenterMap: EntityMap;
};

// ── Reverse enum maps (built once) ─────────────────────────────────────────

const reverseGender = buildReverseMap(GENDER_LABELS);
const reverseMaritalStatus = buildReverseMap(MARITAL_STATUS_LABELS);
const reverseContractType = buildReverseMap(CONTRACT_TYPE_LABELS);
const reverseEducationLevel = buildReverseMap(EDUCATION_LEVEL_LABELS);
const reverseWorkShift = buildReverseMap(WORK_SHIFT_LABELS);
const reverseDisabilityType = buildReverseMap(DISABILITY_TYPE_LABELS);
const reverseBoolean = buildReverseMap(BOOLEAN_LABELS);

// ── Top-level regex patterns ────────────────────────────────────────────────

const DD_MM_YYYY_REGEX = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const DIGITS_ONLY_REGEX = /^\d+$/;

// ── Date fields ─────────────────────────────────────────────────────────────

const DATE_FIELDS = [
  "birthDate",
  "hireDate",
  "lastHealthExamDate",
  "admissionExamDate",
  "terminationExamDate",
  "probation1ExpiryDate",
  "probation2ExpiryDate",
] as const;

// ── Enum fields and their reverse maps ──────────────────────────────────────

const ENUM_FIELDS: Record<string, Record<string, string>> = {
  gender: reverseGender,
  maritalStatus: reverseMaritalStatus,
  contractType: reverseContractType,
  educationLevel: reverseEducationLevel,
  workShift: reverseWorkShift,
  disabilityType: reverseDisabilityType,
};

// ── Boolean fields ──────────────────────────────────────────────────────────

const BOOLEAN_FIELDS = [
  "hasSpecialNeeds",
  "hasChildren",
  "hasChildrenUnder21",
] as const;

// ── Number fields ───────────────────────────────────────────────────────────

const NUMBER_FIELDS = [
  "salary",
  "weeklyHours",
  "height",
  "weight",
  "latitude",
  "longitude",
  "mealAllowance",
  "transportAllowance",
  "healthInsurance",
  "busCount",
  "childrenCount",
] as const;

// ── FK fields (required and optional) ───────────────────────────────────────

const FK_FIELDS: { key: string; label: string; required: boolean }[] = [
  { key: "sectorId", label: "Setor", required: true },
  { key: "jobPositionId", label: "Função", required: true },
  { key: "jobClassificationId", label: "CBO", required: true },
  { key: "branchId", label: "Filial", required: false },
  { key: "costCenterId", label: "Centro de custo", required: false },
];

// ── String fields that need special handling ────────────────────────────────

const STRING_PAD_FIELDS: { key: string; padLength?: number }[] = [
  { key: "cpf", padLength: 11 },
  { key: "pis", padLength: 11 },
  { key: "zipCode", padLength: 8 },
  { key: "phone" },
  { key: "mobile" },
];

// ── Pre-built set of all processed field keys ───────────────────────────────

const PROCESSED_FIELDS = new Set<string>([
  ...DATE_FIELDS,
  ...Object.keys(ENUM_FIELDS),
  ...BOOLEAN_FIELDS,
  ...FK_FIELDS.map((f) => f.key),
  ...NUMBER_FIELDS,
  ...STRING_PAD_FIELDS.map((f) => f.key),
]);

// ── Helper functions ────────────────────────────────────────────────────────

function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || value === "";
}

/**
 * Parses a date value that may come from Excel as a Date object, a string
 * in DD/MM/YYYY format, or a string already in ISO YYYY-MM-DD format.
 */
export function parseDate(value: unknown): string | null {
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    // Try DD/MM/YYYY
    const ddmmyyyy = trimmed.match(DD_MM_YYYY_REGEX);
    if (ddmmyyyy) {
      return `${ddmmyyyy[3]}-${ddmmyyyy[2]}-${ddmmyyyy[1]}`;
    }

    // Try YYYY-MM-DD (already ISO)
    if (ISO_DATE_REGEX.test(trimmed)) {
      return trimmed;
    }
  }

  return null;
}

/**
 * Ensures a value is returned as a string, with optional zero-padding
 * for numeric document fields (CPF, PIS, CEP).
 */
export function ensureStringField(value: unknown, padLength?: number): string {
  const str = String(value ?? "").trim();
  if (padLength && DIGITS_ONLY_REGEX.test(str)) {
    return str.padStart(padLength, "0");
  }
  return str;
}

/**
 * Converts a PT-BR boolean label ("Sim"/"Não"/"Nao") to a boolean value.
 * Returns undefined if the value is empty/null/undefined.
 * Returns null if the value is present but unrecognized.
 */
function parseBoolean(value: unknown): boolean | undefined | null {
  if (isEmpty(value)) {
    return;
  }

  if (typeof value === "boolean") {
    return value;
  }

  const str = String(value).toLowerCase().trim();
  const mapped = reverseBoolean[str];

  if (mapped === "true") {
    return true;
  }
  if (mapped === "false") {
    return false;
  }

  // Also handle direct "sim"/"não"/"nao" without going through reverse map
  if (str === "sim") {
    return true;
  }
  if (str === "não" || str === "nao") {
    return false;
  }

  return null; // unrecognized value
}

/**
 * Parses a numeric value that may come as a string or number from Excel.
 * Returns undefined for empty/null/undefined, or null for unparseable values.
 */
function parseNumber(value: unknown): number | undefined | null {
  if (isEmpty(value)) {
    return;
  }

  if (typeof value === "number") {
    return value;
  }

  const str = String(value).trim().replace(",", ".");
  const num = Number(str);

  if (Number.isNaN(num)) {
    return null;
  }

  return num;
}

// ── Entity name→id map builder ──────────────────────────────────────────────

async function buildEntityMap(
  table:
    | typeof schema.sectors
    | typeof schema.jobPositions
    | typeof schema.jobClassifications
    | typeof schema.branches
    | typeof schema.costCenters,
  organizationId: string
): Promise<EntityMap> {
  const rows = await db
    .select({ id: table.id, name: table.name })
    .from(table)
    .where(
      and(eq(table.organizationId, organizationId), isNull(table.deletedAt))
    );

  const map = new Map<string, string>();
  for (const row of rows) {
    map.set(row.name.toLowerCase().trim(), row.id);
  }
  return map;
}

// ── Row parsing context ─────────────────────────────────────────────────────

type ParseContext = {
  rawRow: Record<string, unknown>;
  rowNumber: number;
  data: Record<string, unknown>;
  errors: ImportRowError[];
};

// ── Row parsing helpers (extracted to reduce cognitive complexity) ───────────

function parseDateFields(ctx: ParseContext): void {
  for (const field of DATE_FIELDS) {
    const raw = ctx.rawRow[field];
    if (isEmpty(raw)) {
      continue;
    }

    const parsed = parseDate(raw);
    if (parsed === null) {
      ctx.errors.push({
        row: ctx.rowNumber,
        field,
        message: `Data inválida: "${String(raw)}"`,
      });
    } else {
      ctx.data[field] = parsed;
    }
  }
}

function parseEnumFields(ctx: ParseContext): void {
  for (const [field, reverseMap] of Object.entries(ENUM_FIELDS)) {
    const raw = ctx.rawRow[field];
    if (isEmpty(raw)) {
      continue;
    }

    const str = String(raw).toLowerCase().trim();
    const enumValue = reverseMap[str];

    if (enumValue) {
      ctx.data[field] = enumValue;
    } else {
      ctx.errors.push({
        row: ctx.rowNumber,
        field,
        message: `Valor inválido: "${String(raw)}"`,
      });
    }
  }
}

function parseBooleanFields(ctx: ParseContext): void {
  for (const field of BOOLEAN_FIELDS) {
    const raw = ctx.rawRow[field];
    if (isEmpty(raw)) {
      continue;
    }

    const parsed = parseBoolean(raw);
    if (parsed === null) {
      ctx.errors.push({
        row: ctx.rowNumber,
        field,
        message: `Valor booleano inválido: "${String(raw)}". Use "Sim" ou "Não"`,
      });
    } else if (parsed !== undefined) {
      ctx.data[field] = parsed;
    }
  }
}

function resolveEntityFields(ctx: ParseContext, maps: EntityMaps): void {
  const entityMaps: Record<string, EntityMap> = {
    sectorId: maps.sectorMap,
    jobPositionId: maps.jobPositionMap,
    jobClassificationId: maps.jobClassificationMap,
    branchId: maps.branchMap,
    costCenterId: maps.costCenterMap,
  };

  for (const fk of FK_FIELDS) {
    const raw = ctx.rawRow[fk.key];
    if (isEmpty(raw)) {
      continue;
    }

    const name = String(raw).toLowerCase().trim();
    const entityMap = entityMaps[fk.key];
    const id = entityMap.get(name);

    if (id) {
      ctx.data[fk.key] = id;
    } else {
      ctx.errors.push({
        row: ctx.rowNumber,
        field: fk.key,
        message: `${fk.label} '${String(raw)}' não encontrado`,
      });
    }
  }
}

function parseNumberFields(ctx: ParseContext): void {
  for (const field of NUMBER_FIELDS) {
    const raw = ctx.rawRow[field];
    if (isEmpty(raw)) {
      continue;
    }

    const parsed = parseNumber(raw);
    if (parsed === null) {
      ctx.errors.push({
        row: ctx.rowNumber,
        field,
        message: `Valor numérico inválido: "${String(raw)}"`,
      });
    } else if (parsed !== undefined) {
      ctx.data[field] = parsed;
    }
  }
}

function ensureStringFields(ctx: ParseContext): void {
  for (const { key, padLength } of STRING_PAD_FIELDS) {
    if (!isEmpty(ctx.rawRow[key])) {
      ctx.data[key] = ensureStringField(ctx.rawRow[key], padLength);
    }
  }
}

function copyRemainingStringFields(ctx: ParseContext): void {
  for (const [key, value] of Object.entries(ctx.rawRow)) {
    if (PROCESSED_FIELDS.has(key)) {
      continue;
    }
    if (isEmpty(value)) {
      continue;
    }
    ctx.data[key] = String(value).trim();
  }
}

// ── ImportParser class ──────────────────────────────────────────────────────

export class ImportParser {
  private readonly maps: EntityMaps;

  private constructor(maps: EntityMaps) {
    this.maps = maps;
  }

  /**
   * Factory method: queries entity name-to-id maps for the organization.
   */
  static async create(organizationId: string): Promise<ImportParser> {
    const [
      sectorMap,
      jobPositionMap,
      jobClassificationMap,
      branchMap,
      costCenterMap,
    ] = await Promise.all([
      buildEntityMap(schema.sectors, organizationId),
      buildEntityMap(schema.jobPositions, organizationId),
      buildEntityMap(schema.jobClassifications, organizationId),
      buildEntityMap(schema.branches, organizationId),
      buildEntityMap(schema.costCenters, organizationId),
    ]);

    return new ImportParser({
      sectorMap,
      jobPositionMap,
      jobClassificationMap,
      branchMap,
      costCenterMap,
    });
  }

  /**
   * Parses and validates a single row from the import spreadsheet.
   */
  parseRow(rawRow: Record<string, unknown>, rowNumber: number): ParseRowResult {
    const ctx: ParseContext = {
      rawRow,
      rowNumber,
      data: {},
      errors: [],
    };

    parseDateFields(ctx);
    parseEnumFields(ctx);
    parseBooleanFields(ctx);
    resolveEntityFields(ctx, this.maps);
    parseNumberFields(ctx);
    ensureStringFields(ctx);
    copyRemainingStringFields(ctx);

    const { data, errors } = ctx;

    // If we already have errors from parsing, return them early
    if (errors.length > 0) {
      return { success: false, errors };
    }

    // Validate through Zod schema
    const result = createEmployeeSchema.safeParse(data);

    if (result.success) {
      return { success: true, data: result.data };
    }

    // Convert Zod errors to ImportRowError format
    const zodErrors: ImportRowError[] = result.error.issues.map((issue) => ({
      row: rowNumber,
      field: issue.path.join(".") || "unknown",
      message: issue.message,
    }));

    return { success: false, errors: zodErrors };
  }
}
