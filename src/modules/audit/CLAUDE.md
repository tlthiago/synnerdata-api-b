# Audit Module

Log de ações para compliance. Registra quem fez o quê, quando e onde.

## Business Rules

- Logs são imutáveis — sem update ou delete
- Logging é assíncrono e silencioso — falhas não propagam erro (silent catch via logger)
- Acesso restrito a organization owners (admin/super_admin bypass allowed)
- Viewers, managers e supervisors recebem 403 FORBIDDEN

## Enums

- action: `create` | `read` | `update` | `delete` | `export` | `login` | `logout` | `accept` | `anonymize`
- resource: `user` | `session` | `organization` | `member` | `employee` | `document` | `medical_certificate` | `labor_lawsuit` | `cpf_analysis` | `subscription` | `export` | `api_key` | `invitation` | `cost_center` | `branch` | `sector` | `job_position` | `job_classification` | `project` | `ppe_item` | `absence` | `accident` | `vacation` | `promotion` | `termination` | `warning` | `ppe_delivery` | `project_employee` | `ppe_job_position` | `ppe_delivery_item`

## Fields

- `userId` (obrigatório) — quem executou
- `organizationId` (nullable) — null para ações fora de org (login, criação de user)
- `resourceId` (nullable) — null para ações em bulk
- `changes` (nullable) — `{ before, after }` para tracking de mudanças em mutations. Convenção em "Mutation Diffs & PII" abaixo
- `ipAddress` — extraído de `x-forwarded-for` ou `x-real-ip`
- `userAgent` — informação do cliente

## Mutation Diffs & PII (CP-42)

Toda chamada de `AuditService.log()` em mutations (create/update/delete) **deve** usar o helper `buildAuditChanges(before, after)` de `src/modules/audit/pii-redaction.ts`.

### Forma do diff

```ts
changes: buildAuditChanges(beforeRecord, afterRecord)
// → { before: { field: oldValue, ... }, after: { field: newValue, ... } }
```

Regras:

- **Apenas campos alterados** aparecem no diff. Campo não mudou → ausente dos dois lados
- **Create**: `buildAuditChanges({}, record)` — campos aparecem só em `after`
- **Delete**: `buildAuditChanges(record, {})` — campos aparecem só em `before`
- **Update**: `buildAuditChanges(existing, updated)` — diff minimal
- **Campos metadata ignorados**: `createdAt`, `updatedAt`, `deletedAt`, `createdBy`, `updatedBy`, `deletedBy` — não aparecem no diff (valores são reconstituíveis do próprio log entry)

### Redação de PII

Campos listados em `PII_FIELDS` são automaticamente substituídos pelo literal `"<redacted>"` em `before` e `after`:

- **Identificação brasileira**: `cpf`, `rg`, `pisPasep`, `ctps`
- **Contato**: `email`, `phone`, `mobile`
- **Financeiro**: `salary`, `hourlyRate`
- **Saúde**: `cid`
- **Data sensível**: `birthDate`

O helper aceita um set custom via segundo parâmetro opcional (útil para entidades com PII fora do conjunto default):

```ts
buildAuditChanges(before, after, {
  piiFields: new Set([...PII_FIELDS, "ssn", "bankAccount"]),
});
```

### Princípio

Diff minimal + PII redacted = rastreabilidade de compliance (LGPD Art. 18/48) sem leak de dado sensível no audit log. O literal `"<redacted>"` indica que o campo **existia e mudou**, sem revelar o valor — suficiente para auditoria interna ou por ANPD.

### Módulos que aplicam a convenção

- `employees` (create/update/updateStatus/delete)
- `occurrences/medical-certificates` (create/update/delete)
- `payments/subscription` (cancel/restore)
- `admin/api-keys` (create/revoke/delete — adicionado em RU-6)

Novos módulos que forem auditados devem seguir o mesmo padrão.

## Read Audit (CP-43)

GET handlers de recursos sensíveis (Art. 11/18 LGPD) logam acessos via `auditPlugin` em `src/plugins/audit/audit-plugin.ts`:

```ts
import { auditPlugin } from "@/plugins/audit/audit-plugin";

export const controller = new Elysia({ ... })
  .use(betterAuthPlugin)
  .use(auditPlugin)   // ordem importa — auditPlugin lê user/session do ctx
  .get("/:id", async ({ params, audit, session }) => {
    const data = await Service.findByIdOrThrow(params.id, session.activeOrganizationId);
    await audit({
      action: "read",
      resource: "medical_certificate",
      resourceId: params.id,
    });
    return wrapSuccess(data);
  }, { auth: { permissions: { ... }, requireOrganization: true } });
```

### Regras

- Audit **só em sucesso** — chamada vem após o service resolver, então 404/403 não geram log (ficam no logger/Sentry)
- **GET individual + export**: sempre auditar
- **GET listagem** (`/`): não audita — cada request vira um log por request, sem `resourceId` específico; listagem já fica no log HTTP
- **`changes: null`** em read — não há antes/depois; o tuplo `(userId, resourceId, ipAddress, userAgent, createdAt)` é suficiente para reconstituir acesso
- **`auditPlugin` deve ser mountado APÓS `betterAuthPlugin`** no controller — o plugin lê `user`/`session` do ctx injetado pelo macro `auth`

### Resources cobertos

- `employee` — GET `/:id` (retorna PII: CPF, salário, email, phone, birthDate)
- `medical_certificate` — GET `/:id` (Art. 11: dado de saúde; inclui CID)
- `cpf_analysis` — GET `/:id` (score de risco atrelado ao CPF)
- `labor_lawsuit` — GET `/:id` (processo trabalhista)

Novos recursos sensíveis devem seguir o mesmo padrão: `.use(auditPlugin)` + chamada de `audit({ action: "read", ... })` no handler.

## Query & Filtering

- Paginação: `limit` (1-100, default 50), `offset` (≥0, default 0)
- Filtros: `resource` (opcional), `startDate`/`endDate` (ISO datetime, opcional)
- Ordenação: sempre `createdAt` DESC

## Endpoints

- `GET /v1/audit-logs` — logs da organização (owner only)
- `GET /v1/audit-logs/:resource/:resourceId` — histórico de um resource específico

## Permissions

- `audit:read` + `requireOrganization: true` + owner role

## Integration

Hooks em `src/lib/auth.ts` logam automaticamente: criação de user, login, CRUD de organization, membership changes, aceitação de convite.
