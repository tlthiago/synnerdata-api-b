import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { expectAuditEntry, findAuditEntry } from "@/test/helpers/audit";
import { createTestEmployee } from "@/test/helpers/employee";
import { createTestPpeItem } from "@/test/helpers/ppe-item";
import { createTestUserWithOrganization } from "@/test/helpers/user";

const BASE_URL = env.API_URL;
let app: TestApp;

beforeAll(() => {
  app = createTestApp();
});

afterEach(async () => {
  await db.delete(schema.auditLogs);
});

function buildDeliveryPayload(employeeId: string, ppeItemIds?: string[]) {
  return {
    employeeId,
    deliveryDate: "2026-04-10",
    reason: "Admissão",
    deliveredBy: "Almoxarifado Central",
    ...(ppeItemIds ? { ppeItemIds } : {}),
  };
}

describe("audit coverage — ppe_delivery_item (M2M)", () => {
  test("POST /v1/ppe-deliveries/:id/items emits audit_logs create entry", async () => {
    const { headers, organizationId, user, userId } =
      await createTestUserWithOrganization({ emailVerified: true });
    const { employee } = await createTestEmployee({ organizationId, userId });
    const ppeItem = await createTestPpeItem({ organizationId, userId });

    const deliveryResp = await app.handle(
      new Request(`${BASE_URL}/v1/ppe-deliveries`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(buildDeliveryPayload(employee.id)),
      })
    );
    const delivery = (await deliveryResp.json()).data;
    await db.delete(schema.auditLogs);

    const addResp = await app.handle(
      new Request(`${BASE_URL}/v1/ppe-deliveries/${delivery.id}/items`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ ppeItemId: ppeItem.id }),
      })
    );
    expect(addResp.status).toBe(200);

    const [row] = await db
      .select()
      .from(schema.ppeDeliveryItems)
      .where(eq(schema.ppeDeliveryItems.ppeDeliveryId, delivery.id));

    const entry = await expectAuditEntry({
      resourceId: row.id,
      action: "create",
      resource: "ppe_delivery_item",
      userId: user.id,
      organizationId,
    });
    expect(entry.changes?.after).toMatchObject({
      ppeDeliveryId: delivery.id,
      ppeItemId: ppeItem.id,
    });
  });

  test("DELETE /v1/ppe-deliveries/:id/items/:ppeItemId emits audit_logs delete entry", async () => {
    const { headers, organizationId, user, userId } =
      await createTestUserWithOrganization({ emailVerified: true });
    const { employee } = await createTestEmployee({ organizationId, userId });
    const ppeItem = await createTestPpeItem({ organizationId, userId });

    const deliveryResp = await app.handle(
      new Request(`${BASE_URL}/v1/ppe-deliveries`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(buildDeliveryPayload(employee.id)),
      })
    );
    const delivery = (await deliveryResp.json()).data;

    await app.handle(
      new Request(`${BASE_URL}/v1/ppe-deliveries/${delivery.id}/items`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ ppeItemId: ppeItem.id }),
      })
    );

    const [row] = await db
      .select()
      .from(schema.ppeDeliveryItems)
      .where(eq(schema.ppeDeliveryItems.ppeDeliveryId, delivery.id));

    await db.delete(schema.auditLogs);

    const removeResp = await app.handle(
      new Request(
        `${BASE_URL}/v1/ppe-deliveries/${delivery.id}/items/${ppeItem.id}`,
        { method: "DELETE", headers }
      )
    );
    expect(removeResp.status).toBe(200);

    const entry = await expectAuditEntry({
      resourceId: row.id,
      action: "delete",
      resource: "ppe_delivery_item",
      userId: user.id,
      organizationId,
    });
    expect(entry.changes?.before).toMatchObject({
      ppeDeliveryId: delivery.id,
      ppeItemId: ppeItem.id,
    });
  });

  test("PUT /v1/ppe-deliveries/:id with new ppeItemIds emits delete + create entries", async () => {
    const { headers, organizationId, user, userId } =
      await createTestUserWithOrganization({ emailVerified: true });
    const { employee } = await createTestEmployee({ organizationId, userId });
    const itemA = await createTestPpeItem({ organizationId, userId });
    const itemB = await createTestPpeItem({ organizationId, userId });

    const deliveryResp = await app.handle(
      new Request(`${BASE_URL}/v1/ppe-deliveries`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(buildDeliveryPayload(employee.id, [itemA.id])),
      })
    );
    const delivery = (await deliveryResp.json()).data;

    const [oldAssoc] = await db
      .select()
      .from(schema.ppeDeliveryItems)
      .where(
        and(
          eq(schema.ppeDeliveryItems.ppeDeliveryId, delivery.id),
          eq(schema.ppeDeliveryItems.ppeItemId, itemA.id)
        )
      );

    await db.delete(schema.auditLogs);

    const updateResp = await app.handle(
      new Request(`${BASE_URL}/v1/ppe-deliveries/${delivery.id}`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ ppeItemIds: [itemB.id] }),
      })
    );
    expect(updateResp.status).toBe(200);

    const [newAssoc] = await db
      .select()
      .from(schema.ppeDeliveryItems)
      .where(
        and(
          eq(schema.ppeDeliveryItems.ppeDeliveryId, delivery.id),
          eq(schema.ppeDeliveryItems.ppeItemId, itemB.id)
        )
      );

    const deleteEntry = await expectAuditEntry({
      resourceId: oldAssoc.id,
      action: "delete",
      resource: "ppe_delivery_item",
      userId: user.id,
      organizationId,
    });
    expect(deleteEntry.changes?.before).toMatchObject({
      ppeDeliveryId: delivery.id,
      ppeItemId: itemA.id,
    });

    const createEntry = await expectAuditEntry({
      resourceId: newAssoc.id,
      action: "create",
      resource: "ppe_delivery_item",
      userId: user.id,
      organizationId,
    });
    expect(createEntry.changes?.after).toMatchObject({
      ppeDeliveryId: delivery.id,
      ppeItemId: itemB.id,
    });
  });

  test("POST /v1/ppe-deliveries with ppeItemIds emits one create entry per association", async () => {
    const { headers, organizationId, user, userId } =
      await createTestUserWithOrganization({ emailVerified: true });
    const { employee } = await createTestEmployee({ organizationId, userId });
    const item1 = await createTestPpeItem({ organizationId, userId });
    const item2 = await createTestPpeItem({ organizationId, userId });

    const resp = await app.handle(
      new Request(`${BASE_URL}/v1/ppe-deliveries`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(
          buildDeliveryPayload(employee.id, [item1.id, item2.id])
        ),
      })
    );
    expect(resp.status).toBe(200);
    const delivery = (await resp.json()).data;

    const rows = await db
      .select()
      .from(schema.ppeDeliveryItems)
      .where(eq(schema.ppeDeliveryItems.ppeDeliveryId, delivery.id));
    expect(rows).toHaveLength(2);

    for (const row of rows) {
      const entry = await expectAuditEntry({
        resourceId: row.id,
        action: "create",
        resource: "ppe_delivery_item",
        userId: user.id,
        organizationId,
      });
      expect(entry.changes?.after).toMatchObject({
        ppeDeliveryId: delivery.id,
        ppeItemId: row.ppeItemId,
      });
    }
  });

  test("PUT /v1/ppe-deliveries/:id without ppeItemIds does not emit M2M audit entries", async () => {
    const { headers, organizationId, userId } =
      await createTestUserWithOrganization({ emailVerified: true });
    const { employee } = await createTestEmployee({ organizationId, userId });
    const ppeItem = await createTestPpeItem({ organizationId, userId });

    const deliveryResp = await app.handle(
      new Request(`${BASE_URL}/v1/ppe-deliveries`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(buildDeliveryPayload(employee.id, [ppeItem.id])),
      })
    );
    const delivery = (await deliveryResp.json()).data;

    const [assoc] = await db
      .select()
      .from(schema.ppeDeliveryItems)
      .where(eq(schema.ppeDeliveryItems.ppeDeliveryId, delivery.id));

    await db.delete(schema.auditLogs);

    const updateResp = await app.handle(
      new Request(`${BASE_URL}/v1/ppe-deliveries/${delivery.id}`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Renovação periódica" }),
      })
    );
    expect(updateResp.status).toBe(200);

    const m2mCreate = await findAuditEntry({
      resourceId: assoc.id,
      action: "create",
    });
    expect(m2mCreate).toBeUndefined();

    const m2mDelete = await findAuditEntry({
      resourceId: assoc.id,
      action: "delete",
    });
    expect(m2mDelete).toBeUndefined();
  });
});
