# PPE Deliveries (Entregas de EPI)

Registro de entregas de Equipamentos de Proteção Individual com controle item-a-item.

## Business Rules

- `deliveryDate` (YYYY-MM-DD), `reason` (max 500), `deliveredBy` (max 200) — obrigatórios
- Employee deve estar ativo no create (`ensureEmployeeActive` — rejeita TERMINATED e ON_VACATION)
- Sem validação de duplicata — múltiplas entregas por dia são válidas
- Relação M2M com `ppeItems` via tabela junction `ppeDeliveryItems` (com soft delete)
- Create aceita `ppeItemIds` opcional — associa EPIs já na criação da entrega
- Update aceita `ppeItemIds` opcional — quando enviado, substitui a lista atual de EPIs (diff-based: mantém existentes, remove ausentes, adiciona novos). `[]` remove todos. Quando omitido, EPIs permanecem inalterados
- Associação duplicada ativa lança `PpeDeliveryItemAlreadyExistsError` (409)
- Todas as operações M2M são auditadas em `ppeDeliveryLogs` (action: `ADDED` | `REMOVED`)
- Response do employee inclui `cpf` além de id/name
- Listagem suporta filtro opcional por `employeeId` e ordenada por `deliveryDate`

## Unique in this module

- Único sub-módulo de occurrences com relação M2M
- Três tabelas: `ppeDeliveries` (principal), `ppeDeliveryItems` (junction), `ppeDeliveryLogs` (audit)
- PPE items validados: devem existir e não estar deletados

## Errors

- `PpeDeliveryNotFoundError` (404)
- `PpeDeliveryAlreadyDeletedError` (404)
- `PpeDeliveryItemNotFoundError` (404)
- `PpeDeliveryItemAlreadyExistsError` (409)
- `PpeDeliveryEmployeeNotFoundError` (404)
- `PpeDeliveryPpeItemNotFoundError` (404)
- `EmployeeTerminatedError` (422) — shared, from `src/lib/errors/employee-status-errors.ts`
- `EmployeeOnVacationError` (422) — shared, from `src/lib/errors/employee-status-errors.ts`
