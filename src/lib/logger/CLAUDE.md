# Logger & Request Context

## Arquitetura

O sistema de logging tem duas camadas com responsabilidades distintas:

| Componente | Arquivo | Responsabilidade |
|-----------|---------|-----------------|
| `loggerPlugin` | `logger/index.ts` | Access log (todas as requests), `X-Request-ID` header, `requestId` no contexto |
| `errorPlugin` | `errors/error-plugin.ts` | Error log (detalhes de 5xx e unhandled), formatação do envelope de erro |
| `request-context` | `request-context.ts` | Propagação do `requestId` via `AsyncLocalStorage` para qualquer camada |

### Fluxo de uma request

```
derive → handler → onAfterHandle (header) → onAfterResponse (access log)
                ↘ onError (header + error log) → onAfterResponse (access log)
```

- `derive`: gera `requestId`, entra no `AsyncLocalStorage`, retorna `requestId` + `requestStart`
- `onAfterHandle`: injeta `X-Request-ID` no header (só sucesso)
- `onError` (logger): injeta `X-Request-ID` no header (só erros — `onAfterHandle` não executa quando há erro)
- `onError` (errorPlugin): formata resposta, seta `set.status`, loga detalhes de 5xx/unhandled
- `onAfterResponse`: access log com status real via `set.status` — executa **sempre** (sucesso e erro)

## Decisões Técnicas

### `enterWith` e não `run` no AsyncLocalStorage

Elysia's `derive` retorna um valor — não aceita callback wrapper. `enterWith` é a API correta para o modelo de hooks do Elysia: define o store para o restante da execução síncrona e persiste nas chamadas assíncronas seguintes. Não é workaround.

### `mixin()` do Pino para injetar `requestId`

`logger.info()`, `logger.error()`, etc. chamados em **qualquer lugar** (services, auth, webhooks) incluem automaticamente o `requestId` da request atual via `mixin()`. Não precisa passar `requestId` como parâmetro — o `AsyncLocalStorage` resolve.

Se chamado fora de uma request (startup, cron jobs), `getRequestId()` retorna `undefined` e o `mixin()` retorna `{}` — graceful degradation.

### Access log sempre `info` — nunca warn/error por status code

O access log (`onAfterResponse`) é sempre `logger.info()`, mesmo para 4xx/5xx. A razão: o `errorPlugin` já loga `logger.error()` para 5xx com stack trace e detalhes. Usar `error` no access log causaria double-logging. O access log é um registro de "o que passou", não um alerta.

### `set.status` para capturar status real

O Elysia tem bugs conhecidos com `status()` que não atualiza `set.status` no lifecycle ([#1501](https://github.com/elysiajs/elysia/issues/1501)). Porém, atribuição direta (`set.status = error.status`) funciona corretamente. O projeto proíbe `status()` (ver CLAUDE.md raiz), então `set.status` é confiável. O fallback `typeof set.status === "number" ? set.status : 200` protege contra edge cases.

### `onError` no loggerPlugin para `X-Request-ID`

`onAfterHandle` só executa em sucesso. Quando há erro, o lifecycle pula para `onError`. Por isso o `loggerPlugin` registra um `onError` próprio **apenas para injetar o header** — sem tocar na response. O `errorPlugin` cuida da formatação.

## Convenção dos campos de log

### Access log (onAfterResponse)
```json
{"level":"info","time":...,"requestId":"req-...","method":"POST","path":"/v1/resource","status":200,"duration":"55ms","msg":"request completed"}
```

### Error log — 5xx AppError (errorPlugin)
```json
{"level":"error","time":...,"requestId":"req-...","method":"POST","path":"/v1/resource","code":"INTERNAL_ERROR","msg":"Mensagem do erro"}
```

### Error log — unhandled (errorPlugin)
```json
{"level":"error","time":...,"requestId":"req-...","method":"POST","path":"/v1/resource","error":{"name":"TypeError","message":"..."},"msg":"unhandled error"}
```

### Pino message convention

Contexto estruturado como primeiro argumento, mensagem legível como segundo:
```typescript
logger.error({ method, path, code }, error.message);    // bom
logger.error({ method, path, message: error.message });  // ruim — message fica buried no JSON
```

## Paths ignorados

Definidos em `logger/index.ts`:
- **Exatos**: `/health`, `/health/live` — liveness/readiness probes (alto volume, sem valor)
- **Prefixos**: `/api/auth` — rotas do Better Auth (sessão, callback OAuth — alto volume)

Para adicionar paths: `ignoredPaths` (exato) ou `ignoredPrefixes` (startsWith).

## Usando o logger em services

```typescript
import { logger } from "@/lib/logger";

// requestId é injetado automaticamente pelo mixin — não precisa passar
logger.info({ type: "employee:created", employeeId }, "employee created");
logger.error({ type: "payment:failed", subscriptionId }, "payment processing failed");
```

## Regras

- **Nunca** use `console.log` — use `logger.*`
- **Nunca** passe `requestId` manualmente para `logger.*` — vem do `mixin()`
- **Nunca** use `status()` do Elysia — use `set.status = N` (ver CLAUDE.md raiz)
- **Nunca** logue em nível `error` no access log — isso é responsabilidade do `errorPlugin`
- **Sempre** use a convenção Pino: `logger.level(contextObject, "message string")`
