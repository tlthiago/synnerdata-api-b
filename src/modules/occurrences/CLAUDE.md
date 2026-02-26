# Occurrences Module

Eventos e registros vinculados a funcionários. Toda ocorrência pertence a um employee que pertence a uma organization.

## Common Patterns (all submodules)

- Todas as ocorrências referenciam `employeeId` (obrigatório) — employee deve existir, pertencer à organização e não estar deletado
- Organization scoping via `session.activeOrganizationId` em todas as queries
- Soft delete em todos os sub-módulos (`deletedAt`/`deletedBy`) — re-delete lança `AlreadyDeletedError` (404)
- Audit trail: `createdBy`, `updatedBy`, `deletedBy` com userId da sessão
- ID format: `<entity>-${crypto.randomUUID()}` (e.g., `absence-...`, `accident-...`)
- Service: abstract class com métodos estáticos, private `findById`/`findByIdIncludingDeleted`
- Listagem ordenada pelo campo de data principal de cada entidade

## Permissions

- Maioria usa resource name específico: `{ absence: ["create"] }`, `{ accident: ["read"] }`
- Exceções: terminations e promotions usam `{ occurrence: ["create"] }` genérico
- Todos requerem `requireOrganization: true`
