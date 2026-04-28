import { beforeEach, describe, expect, spyOn, test } from "bun:test";
import { env } from "@/env";
import { logger } from "@/lib/logger";
import { WebhookService } from "@/modules/payments/webhook/webhook.service";
import { WebhookPayloadBuilder } from "@/test/builders/webhook-payload.builder";

function createValidAuthHeader(): string {
  const credentials = `${env.PAGARME_WEBHOOK_USERNAME}:${env.PAGARME_WEBHOOK_PASSWORD}`;
  return `Basic ${Buffer.from(credentials).toString("base64")}`;
}

describe("WebhookService observability", () => {
  let warnSpy: ReturnType<typeof spyOn<typeof logger, "warn">>;
  let infoSpy: ReturnType<typeof spyOn<typeof logger, "info">>;

  beforeEach(() => {
    warnSpy = spyOn(logger, "warn");
    warnSpy.mockClear();
    infoSpy = spyOn(logger, "info");
    infoSpy.mockClear();
  });

  describe("auth failure logging", () => {
    test("logs webhook:auth_failure with missing_or_wrong_scheme when no Authorization", async () => {
      const payload = new WebhookPayloadBuilder().chargePaid().build();

      await expect(WebhookService.process(payload, null)).rejects.toThrow();

      const authWarn = warnSpy.mock.calls.find(
        (c) => (c[0] as { type: string }).type === "webhook:auth_failure"
      );
      expect(authWarn).toBeDefined();
      expect(authWarn?.[0]).toMatchObject({
        type: "webhook:auth_failure",
        path: "/webhooks/pagarme",
        reason: "missing_or_wrong_scheme",
      });
    });

    test("logs invalid_credentials reason when user/pass don't match", async () => {
      const payload = new WebhookPayloadBuilder().chargePaid().build();

      await expect(
        WebhookService.process(payload, "Basic aW52YWxpZDppbnZhbGlk")
      ).rejects.toThrow();

      const authWarn = warnSpy.mock.calls.find(
        (c) => (c[0] as { type: string }).type === "webhook:auth_failure"
      );
      expect(authWarn?.[0]).toMatchObject({
        reason: "invalid_credentials",
      });
    });

    test("logs missing_separator reason for base64 lacking ':'", async () => {
      const payload = new WebhookPayloadBuilder().chargePaid().build();
      const malformed = `Basic ${Buffer.from("nocolon").toString("base64")}`;

      await expect(
        WebhookService.process(payload, malformed)
      ).rejects.toThrow();

      const authWarn = warnSpy.mock.calls.find(
        (c) => (c[0] as { type: string }).type === "webhook:auth_failure"
      );
      expect(authWarn?.[0]).toMatchObject({ reason: "missing_separator" });
    });

    test("propagates provided clientIp into the log", async () => {
      const payload = new WebhookPayloadBuilder().chargePaid().build();

      await expect(
        WebhookService.process(payload, null, "203.0.113.42")
      ).rejects.toThrow();

      const authWarn = warnSpy.mock.calls.find(
        (c) => (c[0] as { type: string }).type === "webhook:auth_failure"
      );
      expect(authWarn?.[0]).toMatchObject({ ip: "203.0.113.42" });
    });

    test("never logs the raw credentials from Authorization header", async () => {
      const payload = new WebhookPayloadBuilder().chargePaid().build();
      const secret = "super_secret_password_value";
      const header = `Basic ${Buffer.from(`user:${secret}`).toString("base64")}`;

      await expect(WebhookService.process(payload, header)).rejects.toThrow();

      const serialized = JSON.stringify(warnSpy.mock.calls);
      expect(serialized).not.toContain(secret);
    });
  });

  describe("silent-skip logging", () => {
    test("logs webhook:skipped:missing-metadata on charge.paid without organization_id", async () => {
      const payload = new WebhookPayloadBuilder().chargePaid().build();

      await WebhookService.process(payload, createValidAuthHeader());

      const skipLog = infoSpy.mock.calls.find(
        (c) =>
          (c[0] as { type: string }).type === "webhook:skipped:missing-metadata"
      );
      expect(skipLog).toBeDefined();
      expect(skipLog?.[0]).toMatchObject({
        type: "webhook:skipped:missing-metadata",
        eventType: "charge.paid",
        eventId: payload.id,
      });
    });

    test("logs webhook:skipped:missing-metadata on charge.payment_failed without organization_id", async () => {
      const payload = new WebhookPayloadBuilder().chargePaymentFailed().build();

      await WebhookService.process(payload, createValidAuthHeader());

      const skipLog = infoSpy.mock.calls.find(
        (c) =>
          (c[0] as { type: string }).type === "webhook:skipped:missing-metadata"
      );
      expect(skipLog?.[0]).toMatchObject({
        eventType: "charge.payment_failed",
        eventId: payload.id,
      });
    });
  });
});
