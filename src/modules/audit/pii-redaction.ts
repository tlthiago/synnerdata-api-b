const REDACTED_VALUE = "<redacted>";

export const PII_FIELDS: ReadonlySet<string> = new Set([
  "cpf",
  "rg",
  "pisPasep",
  "ctps",
  "email",
  "phone",
  "mobile",
  "birthDate",
  "salary",
  "hourlyRate",
  "cid",
]);

export const IGNORED_AUDIT_FIELDS: ReadonlySet<string> = new Set([
  "createdAt",
  "updatedAt",
  "deletedAt",
  "createdBy",
  "updatedBy",
  "deletedBy",
]);

export type AuditDiff = {
  before: Record<string, unknown>;
  after: Record<string, unknown>;
};

type AuditDiffOptions = {
  piiFields?: ReadonlySet<string>;
  ignoredFields?: ReadonlySet<string>;
};

export function redactPII(
  record: object,
  piiFields: ReadonlySet<string> = PII_FIELDS
): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    output[key] = piiFields.has(key) ? REDACTED_VALUE : value;
  }
  return output;
}

type DiffContext = {
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  beforeDiff: Record<string, unknown>;
  afterDiff: Record<string, unknown>;
  piiFields: ReadonlySet<string>;
  ignoredFields: ReadonlySet<string>;
};

export function buildAuditChanges(
  before: object,
  after: object,
  options: AuditDiffOptions = {}
): AuditDiff {
  const beforeRecord = before as Record<string, unknown>;
  const afterRecord = after as Record<string, unknown>;
  const ctx: DiffContext = {
    before: beforeRecord,
    after: afterRecord,
    beforeDiff: {},
    afterDiff: {},
    piiFields: options.piiFields ?? PII_FIELDS,
    ignoredFields: options.ignoredFields ?? IGNORED_AUDIT_FIELDS,
  };
  const keys = new Set([
    ...Object.keys(beforeRecord),
    ...Object.keys(afterRecord),
  ]);

  for (const key of keys) {
    collectChangedField(key, ctx);
  }

  return { before: ctx.beforeDiff, after: ctx.afterDiff };
}

export function hasAuditChanges(diff: AuditDiff): boolean {
  return (
    Object.keys(diff.before).length > 0 || Object.keys(diff.after).length > 0
  );
}

function collectChangedField(key: string, ctx: DiffContext): void {
  if (ctx.ignoredFields.has(key)) {
    return;
  }
  if (valuesEqual(ctx.before[key], ctx.after[key])) {
    return;
  }
  const redact = ctx.piiFields.has(key);
  if (key in ctx.before) {
    ctx.beforeDiff[key] = redact ? REDACTED_VALUE : ctx.before[key];
  }
  if (key in ctx.after) {
    ctx.afterDiff[key] = redact ? REDACTED_VALUE : ctx.after[key];
  }
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  if (a === null || a === undefined || b === null || b === undefined) {
    return false;
  }
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }
  if (a instanceof Date || b instanceof Date) {
    return false;
  }
  if (typeof a === "object" && typeof b === "object") {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
}
