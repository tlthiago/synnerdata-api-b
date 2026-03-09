import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import type { ProvisionStatusData } from "./provision-status.model";

const NOT_FOUND: ProvisionStatusData = {
  status: "not_found",
  activationUrl: null,
};

const PROCESSING: ProvisionStatusData = {
  status: "processing",
  activationUrl: null,
};

export abstract class ProvisionStatusService {
  static async check(email: string): Promise<ProvisionStatusData> {
    const user = await db.query.users.findFirst({
      where: eq(schema.users.email, email),
      columns: { id: true },
    });

    if (!user) {
      return NOT_FOUND;
    }

    const provision = await db.query.adminOrgProvisions.findFirst({
      where: and(
        eq(schema.adminOrgProvisions.userId, user.id),
        inArray(schema.adminOrgProvisions.status, [
          "pending_payment",
          "pending_activation",
        ])
      ),
    });

    if (!provision) {
      return NOT_FOUND;
    }

    if (provision.status === "pending_payment") {
      return PROCESSING;
    }

    // pending_activation
    if (provision.activationUrl) {
      return { status: "ready", activationUrl: provision.activationUrl };
    }

    return PROCESSING;
  }
}
