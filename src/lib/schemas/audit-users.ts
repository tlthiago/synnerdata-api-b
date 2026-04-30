import { aliasedTable } from "drizzle-orm";
import { schema } from "@/db/schema";

export function auditUserAliases() {
  return {
    creator: aliasedTable(schema.users, "creator"),
    updater: aliasedTable(schema.users, "updater"),
  };
}
