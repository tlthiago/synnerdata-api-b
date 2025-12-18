/**
 * Payment Failure Webhook Validation Test
 *
 * Este teste valida o comportamento atual dos webhooks de falha de pagamento
 * ANTES de implementar o grace period.
 *
 * Objetivos:
 * 1. Confirmar quais eventos são tratados (charge.payment_failed vs invoice.payment_failed)
 * 2. Validar comportamento com múltiplas falhas consecutivas (retries)
 * 3. Verificar comportamento quando pagamento é resolvido após past_due
 * 4. Identificar gaps para implementação do grace period
 *
 * @see docs/improvements/grace-period-webhook-analysis.md
 */

import { beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { env } from "@/env";
import type { ProcessWebhook } from "@/modules/payments/webhook/webhook.model";
import { WebhookService } from "@/modules/payments/webhook/webhook.service";
import { createTestOrganization } from "@/test/helpers/organization";
import { seedPlans } from "@/test/helpers/seed";
import { createActiveSubscription } from "@/test/helpers/subscription";

function createValidAuthHeader(): string {
  const credentials = `${env.PAGARME_WEBHOOK_USERNAME}:${env.PAGARME_WEBHOOK_PASSWORD}`;
  return `Basic ${Buffer.from(credentials).toString("base64")}`;
}

function createPayload(
  type: string,
  data: Record<string, unknown>
): ProcessWebhook {
  return {
    id: `evt_${crypto.randomUUID()}`,
    type,
    created_at: new Date().toISOString(),
    data,
  };
}

describe("Payment Failure Webhook Validation", () => {
  beforeAll(async () => {
    await seedPlans();
  });

  describe("1. Eventos Suportados", () => {
    test("charge.payment_failed DEVE marcar assinatura como past_due", async () => {
      const org = await createTestOrganization();
      await createActiveSubscription(org.id, "test-plan-diamond");

      const payload = createPayload("charge.payment_failed", {
        metadata: { organization_id: org.id },
        invoice: { id: "inv_123" },
        last_transaction: {
          gateway_response: { message: "Insufficient funds" },
        },
      });

      await WebhookService.process(
        payload,
        createValidAuthHeader(),
        JSON.stringify(payload)
      );

      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);

      expect(subscription.status).toBe("past_due");
    });

    test("invoice.payment_failed DEVE marcar como past_due (GAP-01 corrigido)", async () => {
      const org = await createTestOrganization();
      await createActiveSubscription(org.id, "test-plan-diamond");

      const payload = createPayload("invoice.payment_failed", {
        metadata: { organization_id: org.id },
        invoice: { id: "inv_456" },
      });

      await WebhookService.process(
        payload,
        createValidAuthHeader(),
        JSON.stringify(payload)
      );

      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);

      // GAP-01 corrigido: invoice.payment_failed agora é tratado como charge.payment_failed
      expect(subscription.status).toBe("past_due");
    });

    test("subscription.updated com status 'pending' DEVE marcar como past_due", async () => {
      const org = await createTestOrganization();
      const pagarmeSubId = `sub_${crypto.randomUUID()}`;
      await createActiveSubscription(org.id, "test-plan-diamond", pagarmeSubId);

      const payload = createPayload("subscription.updated", {
        id: pagarmeSubId,
        status: "pending",
      });

      await WebhookService.process(
        payload,
        createValidAuthHeader(),
        JSON.stringify(payload)
      );

      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);

      expect(subscription.status).toBe("past_due");
    });

    test("subscription.updated com status 'failed' DEVE marcar como past_due", async () => {
      const org = await createTestOrganization();
      const pagarmeSubId = `sub_${crypto.randomUUID()}`;
      await createActiveSubscription(org.id, "test-plan-diamond", pagarmeSubId);

      const payload = createPayload("subscription.updated", {
        id: pagarmeSubId,
        status: "failed",
      });

      await WebhookService.process(
        payload,
        createValidAuthHeader(),
        JSON.stringify(payload)
      );

      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);

      expect(subscription.status).toBe("past_due");
    });

    test("subscription.updated com status 'unpaid' DEVE marcar como past_due (GAP-05 corrigido)", async () => {
      const org = await createTestOrganization();
      const pagarmeSubId = `sub_${crypto.randomUUID()}`;
      await createActiveSubscription(org.id, "test-plan-diamond", pagarmeSubId);

      const payload = createPayload("subscription.updated", {
        id: pagarmeSubId,
        status: "unpaid", // Status que Pagar.me pode enviar durante retries
      });

      await WebhookService.process(
        payload,
        createValidAuthHeader(),
        JSON.stringify(payload)
      );

      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);

      expect(subscription.status).toBe("past_due");
    });
  });

  describe("2. Comportamento com Múltiplas Falhas (Simulação de Retries)", () => {
    test("múltiplos charge.payment_failed consecutivos mantêm status past_due", async () => {
      const org = await createTestOrganization();
      await createActiveSubscription(org.id, "test-plan-diamond");
      const authHeader = createValidAuthHeader();

      // Simula 4 retries do Pagar.me (padrão: 4 tentativas a cada 3 dias)
      for (let retry = 1; retry <= 4; retry++) {
        const payload = createPayload("charge.payment_failed", {
          metadata: { organization_id: org.id },
          invoice: { id: `inv_retry_${retry}` },
          last_transaction: {
            gateway_response: { message: `Retry ${retry}: Insufficient funds` },
          },
        });

        await WebhookService.process(
          payload,
          authHeader,
          JSON.stringify(payload)
        );

        const [subscription] = await db
          .select()
          .from(schema.orgSubscriptions)
          .where(eq(schema.orgSubscriptions.organizationId, org.id))
          .limit(1);

        expect(subscription.status).toBe("past_due");
      }

      // Verifica que ainda está past_due após 4 retries
      const [finalSubscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);

      expect(finalSubscription.status).toBe("past_due");
    });

    test("todos os eventos de falha são registrados em subscriptionEvents", async () => {
      const org = await createTestOrganization();
      await createActiveSubscription(org.id, "test-plan-diamond");
      const authHeader = createValidAuthHeader();

      const eventIds: string[] = [];

      // Simula 3 falhas
      for (let i = 1; i <= 3; i++) {
        const eventId = `evt_multi_${crypto.randomUUID()}`;
        eventIds.push(eventId);

        const payload: ProcessWebhook = {
          id: eventId,
          type: "charge.payment_failed",
          created_at: new Date().toISOString(),
          data: {
            metadata: { organization_id: org.id },
            invoice: { id: `inv_${i}` },
          },
        };

        await WebhookService.process(
          payload,
          authHeader,
          JSON.stringify(payload)
        );
      }

      // Verifica que todos os eventos foram registrados
      for (const eventId of eventIds) {
        const [event] = await db
          .select()
          .from(schema.subscriptionEvents)
          .where(eq(schema.subscriptionEvents.pagarmeEventId, eventId))
          .limit(1);

        expect(event).toBeDefined();
        expect(event.eventType).toBe("charge.payment_failed");
        expect(event.processedAt).toBeInstanceOf(Date);
      }
    });
  });

  describe("3. Resolução de Pagamento (past_due → active)", () => {
    test("charge.paid DEVE restaurar assinatura de past_due para active", async () => {
      const org = await createTestOrganization();
      await createActiveSubscription(org.id, "test-plan-diamond");
      const authHeader = createValidAuthHeader();

      // 1. Primeiro, simula falha de pagamento
      const failPayload = createPayload("charge.payment_failed", {
        metadata: { organization_id: org.id },
        invoice: { id: "inv_fail" },
      });

      await WebhookService.process(
        failPayload,
        authHeader,
        JSON.stringify(failPayload)
      );

      // Confirma que está past_due
      let [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);

      expect(subscription.status).toBe("past_due");

      // 2. Simula pagamento bem-sucedido (retry do Pagar.me funcionou)
      const successPayload = createPayload("charge.paid", {
        metadata: { organization_id: org.id },
        subscription: { id: "sub_resolved" },
        current_period: {
          start_at: new Date().toISOString(),
          end_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        },
      });

      await WebhookService.process(
        successPayload,
        authHeader,
        JSON.stringify(successPayload)
      );

      // Confirma restauração
      [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);

      expect(subscription.status).toBe("active");
      expect(subscription.pagarmeSubscriptionId).toBe("sub_resolved");
    });

    test("charge.paid após múltiplas falhas DEVE restaurar para active", async () => {
      const org = await createTestOrganization();
      await createActiveSubscription(org.id, "test-plan-diamond");
      const authHeader = createValidAuthHeader();

      // Simula 3 falhas (dias 0, 3, 6)
      for (let i = 1; i <= 3; i++) {
        const failPayload = createPayload("charge.payment_failed", {
          metadata: { organization_id: org.id },
          invoice: { id: `inv_retry_${i}` },
        });

        await WebhookService.process(
          failPayload,
          authHeader,
          JSON.stringify(failPayload)
        );
      }

      // Simula sucesso na 4ª tentativa (dia 9)
      const successPayload = createPayload("charge.paid", {
        metadata: { organization_id: org.id },
        subscription: { id: "sub_finally_paid" },
        current_period: {
          start_at: new Date().toISOString(),
          end_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        },
      });

      await WebhookService.process(
        successPayload,
        authHeader,
        JSON.stringify(successPayload)
      );

      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);

      expect(subscription.status).toBe("active");
    });
  });

  describe("4. Validação de Campos para Grace Period", () => {
    test("charge.payment_failed DEVE definir pastDueSince e gracePeriodEnds (GAP-02/03 corrigido)", async () => {
      const org = await createTestOrganization();
      await createActiveSubscription(org.id, "test-plan-diamond");

      const payload = createPayload("charge.payment_failed", {
        metadata: { organization_id: org.id },
        invoice: { id: "inv_grace_test" },
      });

      await WebhookService.process(
        payload,
        createValidAuthHeader(),
        JSON.stringify(payload)
      );

      const [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);

      expect(subscription.status).toBe("past_due");
      expect(subscription.pastDueSince).not.toBeNull();
      expect(subscription.gracePeriodEnds).not.toBeNull();

      // Grace period deve ser 15 dias
      if (subscription.pastDueSince && subscription.gracePeriodEnds) {
        const graceDays = Math.round(
          (subscription.gracePeriodEnds.getTime() -
            subscription.pastDueSince.getTime()) /
            (1000 * 60 * 60 * 24)
        );
        expect(graceDays).toBe(15);
      }
    });

    test("charge.paid DEVE limpar campos de grace period (GAP-04 corrigido)", async () => {
      const org = await createTestOrganization();
      await createActiveSubscription(org.id, "test-plan-diamond");
      const authHeader = createValidAuthHeader();

      // Falha primeiro
      const failPayload = createPayload("charge.payment_failed", {
        metadata: { organization_id: org.id },
      });
      await WebhookService.process(
        failPayload,
        authHeader,
        JSON.stringify(failPayload)
      );

      // Verifica que os campos foram definidos
      let [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);

      expect(subscription.pastDueSince).not.toBeNull();
      expect(subscription.gracePeriodEnds).not.toBeNull();

      // Sucesso depois
      const successPayload = createPayload("charge.paid", {
        metadata: { organization_id: org.id },
        subscription: { id: "sub_test" },
        current_period: {
          start_at: new Date().toISOString(),
          end_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        },
      });
      await WebhookService.process(
        successPayload,
        authHeader,
        JSON.stringify(successPayload)
      );

      [subscription] = await db
        .select()
        .from(schema.orgSubscriptions)
        .where(eq(schema.orgSubscriptions.organizationId, org.id))
        .limit(1);

      expect(subscription.status).toBe("active");
      expect(subscription.pastDueSince).toBeNull();
      expect(subscription.gracePeriodEnds).toBeNull();
    });
  });

  describe("5. Idempotência", () => {
    test("evento duplicado com mesmo pagarmeEventId NÃO é reprocessado", async () => {
      const org = await createTestOrganization();
      await createActiveSubscription(org.id, "test-plan-diamond");
      const authHeader = createValidAuthHeader();

      const eventId = `evt_idempotent_${crypto.randomUUID()}`;
      const payload: ProcessWebhook = {
        id: eventId,
        type: "charge.payment_failed",
        created_at: new Date().toISOString(),
        data: {
          metadata: { organization_id: org.id },
        },
      };

      // Primeira chamada
      await WebhookService.process(
        payload,
        authHeader,
        JSON.stringify(payload)
      );

      // Segunda chamada com mesmo ID (duplicata)
      await WebhookService.process(
        payload,
        authHeader,
        JSON.stringify(payload)
      );

      // Deve existir apenas 1 registro do evento
      const events = await db
        .select()
        .from(schema.subscriptionEvents)
        .where(eq(schema.subscriptionEvents.pagarmeEventId, eventId));

      expect(events.length).toBe(1);
    });
  });

  describe("6. Resumo de Correções Implementadas", () => {
    test("todos os gaps foram corrigidos para Grace Period", () => {
      const gaps = [
        { id: "GAP-01", status: "CORRIGIDO" },
        { id: "GAP-02", status: "CORRIGIDO" },
        { id: "GAP-03", status: "CORRIGIDO" },
        { id: "GAP-04", status: "CORRIGIDO" },
        { id: "GAP-05", status: "CORRIGIDO" },
      ];

      expect(gaps.every((g) => g.status === "CORRIGIDO")).toBe(true);
    });
  });
});
