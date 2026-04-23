import { beforeEach, describe, expect, spyOn, test } from "bun:test";
import { env } from "@/env";
import { logger } from "@/lib/logger";
import { WebhookService } from "@/modules/payments/webhook/webhook.service";

function createValidAuthHeader(): string {
  const credentials = `${env.PAGARME_WEBHOOK_USERNAME}:${env.PAGARME_WEBHOOK_PASSWORD}`;
  return `Basic ${Buffer.from(credentials).toString("base64")}`;
}

describe("WebhookService error escalation", () => {
  describe("unhandled event type", () => {
    let infoSpy: ReturnType<typeof spyOn<typeof logger, "info">>;

    beforeEach(() => {
      infoSpy = spyOn(logger, "info");
      infoSpy.mockClear();
    });

    test("logs webhook:unhandled-event-type and does not throw for unknown type", async () => {
      const payload = {
        id: `evt_${crypto.randomUUID()}`,
        type: "subscription.reactivated",
        created_at: new Date().toISOString(),
        data: { subscription: { id: "sub_123" } },
      };

      await expect(
        WebhookService.process(payload, createValidAuthHeader())
      ).resolves.toBeUndefined();

      const unhandledLog = infoSpy.mock.calls.find(
        (c) =>
          (c[0] as { type: string }).type === "webhook:unhandled-event-type"
      );
      expect(unhandledLog?.[0]).toMatchObject({
        type: "webhook:unhandled-event-type",
        eventType: "subscription.reactivated",
        eventId: payload.id,
      });
    });

    test("persists the unknown event as processed (no retry loop)", async () => {
      const eventId = `evt_${crypto.randomUUID()}`;
      const payload = {
        id: eventId,
        type: "subscription.experimental",
        created_at: new Date().toISOString(),
        data: {},
      };

      await expect(
        WebhookService.process(payload, createValidAuthHeader())
      ).resolves.toBeUndefined();

      const { db } = await import("@/db");
      const { schema } = await import("@/db/schema");
      const { eq } = await import("drizzle-orm");
      const [row] = await db
        .select()
        .from(schema.subscriptionEvents)
        .where(eq(schema.subscriptionEvents.pagarmeEventId, eventId))
        .limit(1);

      expect(row).toBeDefined();
      expect(row.processedAt).not.toBeNull();
      expect(row.error).toBeNull();
    });
  });
});
