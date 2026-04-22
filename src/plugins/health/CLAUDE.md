# Health Plugin

Plugin de infraestrutura que expõe endpoints de health-check.

## Meta

- **`name`**: `"health"`
- **Prefix**: `/health`
- **OpenAPI tag**: `"Infrastructure"`

## Rotas expostas

- `GET /health` — healthcheck completo com status do DB
- `GET /health/live` — liveness probe para load balancer

## Hooks

**Nenhum**. Plugin puro de rotas. Não adiciona `derive`/`decorate`, não emite eventos de lifecycle.

## Contract de response

Ver `health.model.ts` para schemas tipados (`healthResponseSchema`, `liveResponseSchema`).

`VERSION` é lido de `package.json` no module-init (CP-37); fallback `"unknown"` se a leitura falhar.

## Consumers

- `src/index.ts` — `.use(healthPlugin)` no bootstrap
- `src/test/support/app.ts`, `src/test/helpers/app.ts` — factories de test app

## Ordering

Mountado **cedo** no bootstrap para garantir que probes respondam antes de rotas mais caras (auth, DB-heavy). Vem depois de `errorPlugin` e `loggerPlugin` para que 5xx sejam formatados e todas as requests tenham `X-Request-ID`.
