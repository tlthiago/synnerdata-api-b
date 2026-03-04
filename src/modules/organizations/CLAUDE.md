# Organizations Module

Estrutura organizacional e dados cadastrais. Todos os sub-módulos são scoped por `session.activeOrganizationId`.

## Common Patterns (all submodules)

- Soft delete em todos os sub-módulos (`deletedAt`/`deletedBy`) — exceção: profile (permanente)
- Audit trail: `createdBy`, `updatedBy`, `deletedBy`
- ID format: `<entity>-${crypto.randomUUID()}`
- Listagem ordenada por `name` (exceção: projects ordena por `startDate` DESC)
- Todos requerem `requireOrganization: true`

## M2M Pattern (projects e ppe-items)

- Tabelas junction com soft delete independente
- Verificação de duplicidade ativa antes de associar (409 se já existe)
- Operações M2M usam permissão de `update` do resource pai
