import { describe, expect, it } from "bun:test";
import {
  type AuditUser,
  auditUserSchema,
  mapAuditRelations,
} from "@/lib/responses/response.types";

describe("auditUserSchema", () => {
  it("parses a valid user object unchanged", () => {
    const input = { id: "user-1", name: "João" };
    expect(auditUserSchema.parse(input)).toEqual(input);
  });

  it("accepts null", () => {
    expect(auditUserSchema.parse(null)).toBeNull();
  });

  it("strips unknown keys (Zod default strip mode)", () => {
    const result = auditUserSchema.parse({
      id: "user-1",
      name: "João",
      email: "x@y.com",
    });
    expect(result).toEqual({ id: "user-1", name: "João" });
  });

  it("throws when id is not a string", () => {
    expect(() => auditUserSchema.parse({ id: 123, name: "João" })).toThrow();
  });

  it("throws when name is missing", () => {
    expect(() => auditUserSchema.parse({ id: "user-1" })).toThrow();
  });

  it("throws when value is neither object nor null", () => {
    expect(() => auditUserSchema.parse("user-1")).toThrow();
  });
});

type RawRow = {
  id: string;
  name: string;
  createdAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
  deletedBy: string | null;
  createdByUser: AuditUser;
  updatedByUser: AuditUser;
  deletedByUser: AuditUser;
};

const now = new Date("2026-04-22T00:00:00Z");

describe("mapAuditRelations", () => {
  it("promotes populated relations to the payload keys and drops text columns", () => {
    const raw: RawRow = {
      id: "cost-center-1",
      name: "TI",
      createdAt: now,
      createdBy: "user-1",
      updatedBy: "user-2",
      deletedBy: "user-3",
      createdByUser: { id: "user-1", name: "João" },
      updatedByUser: { id: "user-2", name: "Maria" },
      deletedByUser: { id: "user-3", name: "Ana" },
    };

    const result = mapAuditRelations(raw);

    expect(result).toEqual({
      id: "cost-center-1",
      name: "TI",
      createdAt: now,
      createdBy: { id: "user-1", name: "João" },
      updatedBy: { id: "user-2", name: "Maria" },
      deletedBy: { id: "user-3", name: "Ana" },
    });
    expect(result).not.toHaveProperty("createdByUser");
    expect(result).not.toHaveProperty("updatedByUser");
    expect(result).not.toHaveProperty("deletedByUser");
  });

  it("returns null under every audit key when relations are null", () => {
    const raw: RawRow = {
      id: "cost-center-2",
      name: "RH",
      createdAt: now,
      createdBy: null,
      updatedBy: null,
      deletedBy: null,
      createdByUser: null,
      updatedByUser: null,
      deletedByUser: null,
    };

    const result = mapAuditRelations(raw);

    expect(result.createdBy).toBeNull();
    expect(result.updatedBy).toBeNull();
    expect(result.deletedBy).toBeNull();
  });

  it("handles mixed populated and null relations", () => {
    const raw: RawRow = {
      id: "cost-center-3",
      name: "Financeiro",
      createdAt: now,
      createdBy: "user-1",
      updatedBy: null,
      deletedBy: null,
      createdByUser: { id: "user-1", name: "João" },
      updatedByUser: null,
      deletedByUser: null,
    };

    const result = mapAuditRelations(raw);

    expect(result.createdBy).toEqual({ id: "user-1", name: "João" });
    expect(result.updatedBy).toBeNull();
    expect(result.deletedBy).toBeNull();
  });

  it("preserves non-audit fields unchanged", () => {
    const raw: RawRow & { organizationId: string } = {
      id: "cost-center-4",
      name: "Marketing",
      createdAt: now,
      organizationId: "org-1",
      createdBy: "user-1",
      updatedBy: null,
      deletedBy: null,
      createdByUser: { id: "user-1", name: "João" },
      updatedByUser: null,
      deletedByUser: null,
    };

    const result = mapAuditRelations(raw);

    expect(result.id).toBe("cost-center-4");
    expect(result.name).toBe("Marketing");
    expect(result.createdAt).toBe(now);
    expect(result.organizationId).toBe("org-1");
  });

  it("infers a return type that exposes AuditUser under the audit keys", () => {
    const raw: RawRow = {
      id: "cost-center-5",
      name: "Ops",
      createdAt: now,
      createdBy: "user-1",
      updatedBy: "user-2",
      deletedBy: null,
      createdByUser: { id: "user-1", name: "João" },
      updatedByUser: { id: "user-2", name: "Maria" },
      deletedByUser: null,
    };

    const result = mapAuditRelations(raw);
    const createdBy: AuditUser = result.createdBy;
    const updatedBy: AuditUser = result.updatedBy;
    const deletedBy: AuditUser = result.deletedBy;

    expect(createdBy).toEqual({ id: "user-1", name: "João" });
    expect(updatedBy).toEqual({ id: "user-2", name: "Maria" });
    expect(deletedBy).toBeNull();
  });
});
