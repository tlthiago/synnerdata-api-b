# Logger & Request Context

## Arquitetura

O sistema de logging tem duas camadas com responsabilidades distintas:

| Componente | Arquivo | Responsabilidade |
|-----------|---------|-----------------|
| `loggerPlugin` | `src/plugins/logger/logger-plugin.ts` | Access log (todas as requests), `X-Request-ID` header, `requestId` no contexto |
| `logger` (Pino util) | `src/lib/logger.ts` | Instância Pino + `shouldIgnore` + `generateRequestId` (utilitário puro, sem lifecycle Elysia) |
| `errorPlugin` | `src/plugins/errors/error-plugin.ts` | Error log (detalhes de 5xx e unhandled), formatação do envelope de erro |
| `request-context` | `src/lib/request-context.ts` | Propagação do `requestId` via `AsyncLocalStorage` para qualquer camada |

### Fluxo de uma request

```
onRequest (requestId + header) → derive (context) → handler → onAfterResponse (access log)
                                                           ↘ onError (errorPlugin) → onAfterResponse
```

- `onRequest`: gera `requestId`, entra no `AsyncLocalStorage` via `enterRequestContext`, injeta `X-Request-ID` no header. Dispara em **toda** request — incluindo 404 unmatched e parse errors, que ocorrem antes do route matching
- `derive`: retorna `{ requestId, requestStart }` no context tipado do Elysia, lendo o `requestId` já gravado no `AsyncLocalStorage`
- `onError` (errorPlugin): formata resposta, seta `set.status`, loga detalhes de 5xx/unhandled. O header já foi setado em `onRequest`, não precisa reinjetar
- `onAfterResponse`: access log com status real via `set.status` — executa **sempre** (sucesso e erro)

## Decisões Técnicas

### `onRequest` e não `derive` para gerar o `requestId`

`derive` executa **após** o route matching do Elysia, então não dispara para rotas 404 unmatched nem para parse errors — cenários em que `onError` é chamado com context vazio (ver [elysiajs/elysia#1467](https://github.com/elysiajs/elysia/issues/1467)). Gerar o `requestId` em `onRequest` (primeiro hook do lifecycle, executa antes do route matching) garante que 100% das responses — incluindo 404 de scanners/bots e payloads malformados — tenham `X-Request-ID` no header e `error.requestId` no body para correlacionar com logs.

O `derive` permanece, mas agora apenas **lê** o `requestId` do `AsyncLocalStorage` pra expô-lo no context tipado do Elysia (mantém compatibilidade com hooks que fazem `({ requestId }) => …`).

### `enterWith` e não `run` no AsyncLocalStorage

`enterWith` é a API correta para o modelo de hooks do Elysia: define o store para o restante da execução síncrona e persiste nas chamadas assíncronas seguintes. Usado em `onRequest` logo que a request entra no servidor.

### `mixin()` do Pino para injetar `requestId`

`logger.info()`, `logger.error()`, etc. chamados em **qualquer lugar** (services, auth, webhooks) incluem automaticamente o `requestId` da request atual via `mixin()`. Não precisa passar `requestId` como parâmetro — o `AsyncLocalStorage` resolve.

Se chamado fora de uma request (startup, cron jobs), `getRequestId()` retorna `undefined` e o `mixin()` retorna `{}` — graceful degradation.

### Access log sempre `info` — nunca warn/error por status code

O access log (`onAfterResponse`) é sempre `logger.info()`, mesmo para 4xx/5xx. A razão: o `errorPlugin` já loga `logger.error()` para 5xx com stack trace e detalhes. Usar `error` no access log causaria double-logging. O access log é um registro de "o que passou", não um alerta.

### `set.status` para capturar status real

O Elysia tem bugs conhecidos com `status()` que não atualiza `set.status` no lifecycle ([#1501](https://github.com/elysiajs/elysia/issues/1501)). Porém, atribuição direta (`set.status = error.status`) funciona corretamente. O projeto proíbe `status()` (ver CLAUDE.md raiz), então `set.status` é confiável. O fallback `typeof set.status === "number" ? set.status : 200` protege contra edge cases.

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

Definidos em `src/lib/logger.ts`:
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
