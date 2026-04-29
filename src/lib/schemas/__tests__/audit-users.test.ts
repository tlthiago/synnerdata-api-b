import { describe, expect, test } from "bun:test";
import { schema } from "@/db/schema";
import { auditUserAliases } from "../audit-users";

describe("auditUserAliases", () => {
  test("returns creator and updater aliases distinct from base users table", () => {
    const { creator, updater } = auditUserAliases();
    expect(creator).toBeDefined();
    expect(updater).toBeDefined();
    expect(creator).not.toBe(schema.users);
    expect(updater).not.toBe(schema.users);
    expect(creator).not.toBe(updater);
  });

  test("aliases expose id and name columns from users", () => {
    const { creator, updater } = auditUserAliases();
    expect(creator.id).toBeDefined();
    expect(creator.name).toBeDefined();
    expect(updater.id).toBeDefined();
    expect(updater.name).toBeDefined();
  });
});
