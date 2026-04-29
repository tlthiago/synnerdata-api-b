# Cost Centers (Centros de Custo)

Centros de custo para alocação financeira. Referenciado por employees (FK opcional).

## Business Rules

- `name` (1-100 chars) — único por organização (case-insensitive, soft-delete-aware)
- CRUD simples com soft delete

## Audit logging

- Resource key: `cost_center`
- Mutations logged: create, update, delete (via `AuditService.log` + `buildAuditChanges`)
- Read audit: not enabled (data is not LGPD Art. 11/18 sensitive)

## Permissions

- `costCenter:create` | `costCenter:read` | `costCenter:update` | `costCenter:delete`

## Errors

- `CostCenterNotFoundError` (404)
- `CostCenterAlreadyExistsError` (409)
- `CostCenterAlreadyDeletedError` (404)

## User Attribution Shape (Reference Implementation)

Este módulo é a referência canônica para expor `createdBy`/`updatedBy` como `{ id, name }` na resposta da API (PRD #4 — `docs/improvements/2026-04-27-user-attribution-roadmap-design.md`). PRDs subsequentes (#5+) replicam este padrão para os 23 módulos restantes.

### Padrão obrigatório

- **Helper de aliases**: `auditUserAliases()` em `src/lib/schemas/audit-users.ts` retorna `{ creator, updater }` aliasados de `users`. Use sempre — não duplique `aliasedTable(schema.users, "...")` direto.
- **Schema de resposta**: `entityReferenceSchema` em `src/lib/schemas/relationships.ts` é o `{ id, name }`. Use sempre — não introduza `auditUserSchema` ou variantes.
- **Estilo de query**: Drizzle Core API com `select()` inline + `innerJoin` em creator e updater. **Não** use a Relational API (`db.query` + `with`) — o pattern do projeto é Core.
- **Constraints**: `createdBy` e `updatedBy` são FKs `NOT NULL ON DELETE RESTRICT` para `users.id` (enforced pela PRD #3). `innerJoin` é seguro porque o FK target sempre existe (anonymização preserva a linha).
- **Atribuição de deleção**: não há campo `deletedBy` no domain table nem no response — `audit_logs` é a fonte. PRD #3 removeu `deletedBy` de todas as 24 tabelas que tinham.

### Forma do response data schema

```ts
import { entityReferenceSchema } from "@/lib/schemas/relationships";

const costCenterDataSchema = z.object({
  // ... campos do recurso ...
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  createdBy: entityReferenceSchema,
  updatedBy: entityReferenceSchema,
});
```

### Forma da query (read paths)

```ts
import { auditUserAliases } from "@/lib/schemas/audit-users";

const { creator, updater } = auditUserAliases();

const [row] = await db
  .select({
    // ... campos do recurso ...
    createdBy: { id: creator.id, name: creator.name },
    updatedBy: { id: updater.id, name: updater.name },
  })
  .from(schema.costCenters)
  .innerJoin(creator, eq(schema.costCenters.createdBy, creator.id))
  .innerJoin(updater, eq(schema.costCenters.updatedBy, updater.id))
  .where(/* ... */)
  .limit(1);
```

### Mutation pattern

- **Create**: `INSERT ... RETURNING` → `audit_logs` log → `findByIdOrThrow(id)` re-read para retornar com a forma enriquecida.
- **Update**: `UPDATE ... RETURNING` → `audit_logs` log → `findByIdOrThrow(id)` re-read.
- **Delete (soft)**: `findByIdIncludingDeleted` (já enriquecido) → `UPDATE ... SET deletedAt = now() RETURNING` → `audit_logs` log → retorne `{ ...existing, deletedAt }`.

Sem transaction wrapper. O custo de uma read extra é negligenciável e o código fica direto.

### Audit log

`IGNORED_AUDIT_FIELDS` em `src/modules/audit/pii-redaction.ts` já ignora `createdBy`, `updatedBy`, `createdAt`, `updatedAt`, `deletedAt`. Logo, a mudança de forma do `existing` (objeto vs string user_id) **não vaza** para o `changes` do audit log — o diff continua minimal.

### Cobertura de teste end-to-end

`__tests__/anonymized-creator.test.ts` valida o path PRD #2 + PRD #3 + PRD #4: cria cost-center com manager → manager se anonimiza via `POST /v1/account/anonymize` → owner faz GET → response retorna `createdBy: { id: managerId, name: "Usuário removido" }`. Esse teste prova que o FK target sobrevive à anonymization e que o join surface o nome canônico.
