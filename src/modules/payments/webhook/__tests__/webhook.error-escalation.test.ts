import { beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { env } from "@/env";
import { ErrorReporter } from "@/lib/error-reporter";
import { logger } from "@/lib/logger";
import { SubscriptionService } from "@/modules/payments/subscription/subscription.service";
import { WebhookService } from "@/modules/payments/webhook/webhook.service";
import { WebhookPayloadBuilder } from "@/test/builders/webhook-payload.builder";

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

  describe("ErrorReporter escalation on handler failure", () => {
    let captureSpy: ReturnType<typeof spyOn<typeof ErrorReporter, "capture">>;

    beforeEach(() => {
      captureSpy = spyOn(ErrorReporter, "capture").mockImplementation(
        () => "mock-sentry-id"
      );
      captureSpy.mockClear();
    });

    test("invokes ErrorReporter.capture with tags { webhook_event_type, pagarme_event_id } when handler throws", async () => {
      const failure = new Error("handler exploded");
      const originalMarkActive = SubscriptionService.markActive;
      const stubbedMarkActive = mock(() => Promise.reject(failure));
      (
        SubscriptionService as unknown as {
          markActive: typeof SubscriptionService.markActive;
        }
      ).markActive =
        stubbedMarkActive as unknown as typeof SubscriptionService.markActive;

      const payload = new WebhookPayloadBuilder()
        .chargePaid()
        .withOrganizationId("org-forcing-markActive")
        .build();

      try {
        await expect(
          WebhookService.process(payload, createValidAuthHeader())
        ).rejects.toThrow("handler exploded");

        expect(captureSpy).toHaveBeenCalledTimes(1);
        const [capturedError, context] = captureSpy.mock.calls[0];
        expect(capturedError).toBe(failure);
        expect(context).toMatchObject({
          tags: {
            webhook_event_type: "charge.paid",
            pagarme_event_id: payload.id,
          },
        });
      } finally {
        (
          SubscriptionService as unknown as {
            markActive: typeof SubscriptionService.markActive;
          }
        ).markActive = originalMarkActive;
      }
    });

    test("still persists the error message to subscription_events.error and rethrows", async () => {
      const failure = new Error("transient DB timeout");
      const originalMarkPastDue = SubscriptionService.markPastDue;
      const stubbedMarkPastDue = mock(() => Promise.reject(failure));
      (
        SubscriptionService as unknown as {
          markPastDue: typeof SubscriptionService.markPastDue;
        }
      ).markPastDue =
        stubbedMarkPastDue as unknown as typeof SubscriptionService.markPastDue;

      const payload = new WebhookPayloadBuilder()
        .chargePaymentFailed()
        .withOrganizationId("org-forcing-markPastDue")
        .build();

      try {
        await expect(
          WebhookService.process(payload, createValidAuthHeader())
        ).rejects.toThrow("transient DB timeout");

        expect(captureSpy).toHaveBeenCalledTimes(1);

        const { db } = await import("@/db");
        const { schema } = await import("@/db/schema");
        const { eq } = await import("drizzle-orm");
        const [row] = await db
          .select()
          .from(schema.subscriptionEvents)
          .where(eq(schema.subscriptionEvents.pagarmeEventId, payload.id))
          .limit(1);

        expect(row.error).toBe("transient DB timeout");
        expect(row.processedAt).toBeNull();
      } finally {
        (
          SubscriptionService as unknown as {
            markPastDue: typeof SubscriptionService.markPastDue;
          }
        ).markPastDue = originalMarkPastDue;
      }
    });
  });
});
