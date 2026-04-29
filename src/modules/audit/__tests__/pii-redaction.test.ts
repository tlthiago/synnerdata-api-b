import { describe, expect, test } from "bun:test";
import {
  buildAuditChanges,
  hasAuditChanges,
  IGNORED_AUDIT_FIELDS,
  PII_FIELDS,
  redactPII,
} from "@/modules/audit/pii-redaction";

describe("PII_FIELDS", () => {
  test("includes brazilian identification fields", () => {
    expect(PII_FIELDS.has("cpf")).toBe(true);
    expect(PII_FIELDS.has("rg")).toBe(true);
    expect(PII_FIELDS.has("pisPasep")).toBe(true);
    expect(PII_FIELDS.has("ctps")).toBe(true);
  });

  test("includes financial fields", () => {
    expect(PII_FIELDS.has("salary")).toBe(true);
    expect(PII_FIELDS.has("hourlyRate")).toBe(true);
  });

  test("includes contact fields", () => {
    expect(PII_FIELDS.has("email")).toBe(true);
    expect(PII_FIELDS.has("phone")).toBe(true);
    expect(PII_FIELDS.has("mobile")).toBe(true);
  });

  test("includes health and date fields", () => {
    expect(PII_FIELDS.has("cid")).toBe(true);
    expect(PII_FIELDS.has("birthDate")).toBe(true);
  });
});

describe("IGNORED_AUDIT_FIELDS", () => {
  test("includes standard timestamps and authorship columns", () => {
    expect(IGNORED_AUDIT_FIELDS.has("createdAt")).toBe(true);
    expect(IGNORED_AUDIT_FIELDS.has("updatedAt")).toBe(true);
    expect(IGNORED_AUDIT_FIELDS.has("deletedAt")).toBe(true);
    expect(IGNORED_AUDIT_FIELDS.has("createdBy")).toBe(true);
    expect(IGNORED_AUDIT_FIELDS.has("updatedBy")).toBe(true);
  });
});

describe("redactPII", () => {
  test("returns empty object when input is empty", () => {
    expect(redactPII({})).toEqual({});
  });

  test("replaces PII fields with <redacted>", () => {
    const input = { cpf: "123.456.789-00", name: "João" };

    const result = redactPII(input);

    expect(result.cpf).toBe("<redacted>");
    expect(result.name).toBe("João");
  });

  test("leaves non-PII fields untouched", () => {
    const input = { id: "emp-1", name: "João", position: "Dev" };

    const result = redactPII(input);

    expect(result).toEqual(input);
  });

  test("redacts every PII field encountered", () => {
    const input = {
      cpf: "x",
      rg: "y",
      email: "a@b.com",
      phone: "11 99999-9999",
      salary: 5000,
      birthDate: "1990-01-01",
      cid: "Z73.0",
      safe: "keep",
    };

    const result = redactPII(input);

    expect(result.cpf).toBe("<redacted>");
    expect(result.rg).toBe("<redacted>");
    expect(result.email).toBe("<redacted>");
    expect(result.phone).toBe("<redacted>");
    expect(result.salary).toBe("<redacted>");
    expect(result.birthDate).toBe("<redacted>");
    expect(result.cid).toBe("<redacted>");
    expect(result.safe).toBe("keep");
  });

  test("accepts custom piiFields set", () => {
    const input = { cpf: "x", customSensitive: "secret", safe: "keep" };
    const customFields = new Set(["customSensitive"]);

    const result = redactPII(input, customFields);

    expect(result.cpf).toBe("x");
    expect(result.customSensitive).toBe("<redacted>");
    expect(result.safe).toBe("keep");
  });

  test("does not recurse into nested objects", () => {
    const nested = { street: "Rua X", number: 42 };
    const input = { address: nested, name: "João" };

    const result = redactPII(input);

    expect(result.address).toBe(nested);
  });

  test("produces a new object, does not mutate input", () => {
    const input = { cpf: "x", name: "y" };

    redactPII(input);

    expect(input.cpf).toBe("x");
  });
});

describe("buildAuditChanges", () => {
  test("returns empty diff when records are identical", () => {
    const record = { id: "1", name: "João", active: true };

    const diff = buildAuditChanges(record, record);

    expect(diff.before).toEqual({});
    expect(diff.after).toEqual({});
  });

  test("returns only changed fields on both sides", () => {
    const before = { id: "1", name: "João", position: "Jr" };
    const after = { id: "1", name: "João", position: "Sr" };

    const diff = buildAuditChanges(before, after);

    expect(diff.before).toEqual({ position: "Jr" });
    expect(diff.after).toEqual({ position: "Sr" });
  });

  test("ignores metadata/timestamp fields even when changed", () => {
    const before = {
      name: "João",
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-01"),
      updatedBy: "user-1",
    };
    const after = {
      name: "João",
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-04-22"),
      updatedBy: "user-2",
    };

    const diff = buildAuditChanges(before, after);

    expect(diff.before).toEqual({});
    expect(diff.after).toEqual({});
  });

  test("redacts PII fields in both before and after", () => {
    const before = { cpf: "111.111.111-11", name: "João" };
    const after = { cpf: "222.222.222-22", name: "Maria" };

    const diff = buildAuditChanges(before, after);

    expect(diff.before).toEqual({ cpf: "<redacted>", name: "João" });
    expect(diff.after).toEqual({ cpf: "<redacted>", name: "Maria" });
  });

  test("handles null to value transitions", () => {
    const before = { cancelReason: null };
    const after = { cancelReason: "Preço" };

    const diff = buildAuditChanges(before, after);

    expect(diff.before).toEqual({ cancelReason: null });
    expect(diff.after).toEqual({ cancelReason: "Preço" });
  });

  test("handles value to null transitions", () => {
    const before = { reviewedAt: new Date("2026-01-01") };
    const after = { reviewedAt: null };

    const diff = buildAuditChanges(before, after);

    expect(diff.before.reviewedAt).toBeInstanceOf(Date);
    expect(diff.after).toEqual({ reviewedAt: null });
  });

  test("treats equal Date values as unchanged", () => {
    const date = new Date("2026-04-22");
    const before = { startDate: date, name: "x" };
    const after = { startDate: new Date("2026-04-22"), name: "y" };

    const diff = buildAuditChanges(before, after);

    expect(diff.before).toEqual({ name: "x" });
    expect(diff.after).toEqual({ name: "y" });
  });

  test("treats structurally equal nested objects as unchanged", () => {
    const before = { metadata: { a: 1, b: 2 }, name: "x" };
    const after = { metadata: { a: 1, b: 2 }, name: "y" };

    const diff = buildAuditChanges(before, after);

    expect(diff.before).toEqual({ name: "x" });
    expect(diff.after).toEqual({ name: "y" });
  });

  test("considers field added in after as changed", () => {
    const before: Record<string, unknown> = {};
    const after = { notes: "new" };

    const diff = buildAuditChanges(before, after);

    expect(diff.before).toEqual({});
    expect(diff.after).toEqual({ notes: "new" });
  });

  test("considers field removed in after as changed", () => {
    const before = { notes: "old" };
    const after: Record<string, unknown> = {};

    const diff = buildAuditChanges(before, after);

    expect(diff.before).toEqual({ notes: "old" });
    expect(diff.after).toEqual({});
  });
});

describe("hasAuditChanges", () => {
  test("is false when both sides are empty", () => {
    expect(hasAuditChanges({ before: {}, after: {} })).toBe(false);
  });

  test("is true when before has keys", () => {
    expect(hasAuditChanges({ before: { name: "x" }, after: {} })).toBe(true);
  });

  test("is true when after has keys", () => {
    expect(hasAuditChanges({ before: {}, after: { name: "y" } })).toBe(true);
  });
});
