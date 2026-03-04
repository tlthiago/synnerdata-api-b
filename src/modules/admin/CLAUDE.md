# Admin Module

Recursos exclusivos para administradores da plataforma. Composite controller com prefix `/v1/admin`.

## Sub-módulos

- `organizations/` — listagem, detalhes e configuração de organizações (Power BI URL)
- `api-keys/` — chaves de API para integrações externas

## Padrões

- Todos os endpoints usam `requireAdmin: true` (admin ou super_admin)
- Não são scoped por organização — operam sobre todas as orgs
- OpenAPI tags seguem `Admin - <Sub-módulo>` (e.g., `Admin - Organizations`, `Admin - API Keys`)
- Sub-controllers definem prefix relativo (e.g., `/organizations`), herdando `/v1/admin` do composite

## Adicionando novos sub-módulos

1. Criar pasta `src/modules/admin/<nome>/` seguindo o padrão do projeto (index.ts, service, model, errors, __tests__)
2. Controller com prefix relativo: `prefix: "/<nome>"`
3. Registrar no composite controller (`src/modules/admin/index.ts`) via `.use()`
4. Documentar neste CLAUDE.md
