# Error Plugin

Handler global de erros. Captura `AppError`, validation errors do Elysia, 404s não-roteados e erros inesperados (500). Formata todos no envelope `{ success: false, error: {...} }`.

## Meta

- **`name`**: `"error-handler"`
- **Instance-level**: `.as("scoped")` — garante que o handler `onError` registrado no plugin propague para o app pai que o mounta.
- **OpenAPI tag**: N/A (plugin não adiciona rotas)

## Hooks

| Hook | Scope | Responsabilidade |
|---|---|---|
| `.error({ AppError })` | N/A — registra tipo | Ensina o Elysia a reconhecer `AppError` instances para roteamento do onError |
| `.onError({ as: "global" }, ...)` | global | Formata resposta para `AppError`, `VALIDATION`, `NOT_FOUND`, e unhandled 500 |

**Nenhum `derive`/`decorate`** — plugin não adiciona props ao context. Só observa e responde a erros.

## Função exportada auxiliar

- `formatErrorDetail(error, depth = 0)` — caminha `error.cause` recursivamente com limite de `MAX_ERROR_DETAIL_DEPTH = 5` (CP-29). Usada pelo handler para serializar erro unhandled em log, e disponível para testes unit.

## Decisões técnicas

### Por que `.as("scoped")` na instância

Sem `.as("scoped")`, o `.onError` propagaria apenas por escopo `global` dos hooks internos — mas o `.as("scoped")` no fim cimenta o contrato "este plugin afeta o app pai que o mounta, mas não instâncias-irmãs". Funciona em conjunto com o `{ as: "global" }` do onError.

### Interação com `loggerPlugin`

- `X-Request-ID` header é setado pelo `loggerPlugin.onRequest` (não pelo error-plugin).
- O `errorPlugin.onError` lê `requestId` via `getRequestId()` do AsyncLocalStorage para injetar no body da response.
- 5xx passa por ambos: `errorPlugin` formata o envelope, `loggerPlugin.onAfterResponse` faz o access log (sem double-logging porque errorPlugin usa `logger.error` e access log usa `logger.info`).

### Proibição de `status()` do Elysia

O plugin atribui diretamente `set.status = error.status` em vez de chamar `status(N)`. Razão em `src/plugins/logger/CLAUDE.md` (bug de lifecycle do Elysia).

## Consumers

- `src/index.ts` — primeiro no bootstrap (antes de loggerPlugin, para que erros ao gerar requestId sejam capturados)
- `src/test/support/app.ts`, `src/test/helpers/app.ts`, `src/plugins/logger/__tests__/logger-plugin.test.ts`, `src/lib/ratelimit/__tests__/ratelimit.test.ts`

## Envelope de erro

Todo erro retorna formato consistente:

```ts
{
  success: false,
  error: {
    code: string,          // "NOT_FOUND" | "VALIDATION_ERROR" | "INTERNAL_ERROR" | domain codes
    message: string,
    requestId: string,     // correlaciona com X-Request-ID header e logs
    details?: unknown,     // para VALIDATION (array de issues) ou AppError.details
    cause?: unknown,       // só em dev — formatErrorDetail do erro original
  }
}
```
