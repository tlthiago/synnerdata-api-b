# Plugins Elysia

Convenção para plugins Elysia do projeto. Firmada em CP-1 (2026-04-22).

## O que vive aqui

Apenas arquivos que exportam uma **instância Elysia** consumida via `app.use(X)` no bootstrap. Exemplos: `loggerPlugin`, `healthPlugin`, `errorPlugin`, `betterAuthPlugin`, `cronPlugin`, `auditPlugin`.

**Não vive aqui**: utilitários puros (pass-through util functions, classes de erro, validators), side-effect inits (Sentry, Zod locale config), ou bootstrap helpers (shutdown). Esses ficam em `src/lib/`.

## Estrutura por plugin

```
src/plugins/<nome>/
├── <nome>-plugin.ts       # Plugin (arquivo principal)
├── CLAUDE.md              # Documentação de contrato
└── __tests__/             # Tests colocalizados
    └── <nome>-plugin.test.ts
```

Exceção: `auditPlugin` (precedente histórico de RU-8) está em `plugins/audit/audit-plugin.ts` e segue esta mesma convenção.

## Regras do plugin

### `name` obrigatório

Todo plugin exporta instância com `name` único:

```ts
export const fooPlugin = new Elysia({ name: "foo" })...
```

`name` habilita deduplicação automática do Elysia — múltiplos `.use(fooPlugin)` viram um só. Sem `name`, cada `.use()` roda os hooks de novo.

### Export only the plugin

Arquivo `<nome>-plugin.ts` exporta **somente** o plugin e types relacionados. Utilitários puros usados pelo plugin (ex: instância Pino, helpers de formatação) ficam em `src/lib/<nome>.ts` ou equivalente. Plugin importa do util, não o contrário.

Exemplo (logger):
- `src/lib/logger.ts` → `export const logger = pino(...)` (util)
- `src/plugins/request-logger/logger-plugin.ts` → `export const loggerPlugin = new Elysia(...)` (plugin que consome o util)

### Tests colocalizados

Tests ficam em `__tests__/` ao lado do plugin. Nomear `<nome>-plugin.test.ts`. Tests importam do próprio plugin, montam um mini-app com `.use(plugin)`, e exercitam o comportamento.

### CLAUDE.md por plugin

Cada plugin documenta no seu `CLAUDE.md`:

1. **`name`** do plugin
2. **Hooks** declarados + scope (`local` default, `{ as: "scoped" }`, `{ as: "global" }`)
3. **Context additions** via `.derive()`/`.decorate()`/`.state()` — quais props adiciona ao context tipado, com types exportados
4. **Macros** declaradas via `.macro()` (se houver) — assinatura e uso
5. **Routes** expostas (se houver)
6. **Consumers** principais — quem mounta esse plugin

## Scope — quando usar o quê

Referência: [Elysia Plugin Essentials](https://elysiajs.com/essential/plugin.html).

### Per-hook `{ as: ... }` — controle granular

Aplicado em hooks específicos:

- `local` (default) — hook só dispara em rotas da instância atual + descendentes
- `scoped` — afeta instância pai + atual + descendentes (útil quando plugin define guard que precisa valer no app que o mounta)
- `global` — afeta todas as instâncias do app (útil para hooks cross-cutting como access log, request-ID)

Exemplo (logger):
```ts
.onRequest(({ set }) => {...})                              // local — ok, é root-mounted
.derive({ as: "global" }, () => ({ requestId, ... }))       // global — context disponível em toda rota
.onAfterResponse({ as: "global" }, ({...}) => {...})        // global — access log em toda rota
```

### Instance-level `.as('scoped' | 'plugin')` — raramente necessário

Só aceita `'scoped'` ou `'plugin'` (nunca `'global'`). Eleva scope dos hooks **locais** um nível pra cima. Útil quando plugin filho precisa que hooks virem scoped no pai.

**Não aplicar por padrão** — defaults + per-hook modifiers cobrem 95% dos casos.

## Plugin composição

Plugins podem usar outros via `.use()`:

```ts
export const cronPlugin = new Elysia({ name: "cron-jobs" })
  .use(cron({ name: "expire-trials", ... }))
  .use(cron({ name: "notify-expiring-trials", ... }))
```

Deduplicação do Elysia garante que mountar plugins encadeados não roda hooks duplicados.

## Ordering no bootstrap

`src/index.ts` mounta plugins em ordem deliberada. Regra prática:

1. `errorPlugin` — precisa ser antes de qualquer rota que possa lançar erro
2. `loggerPlugin` — precisa ser antes de rotas pra capturar `requestId` em todas
3. `healthPlugin` — plugins de infra antes de rotas de domínio
4. Plugins utilitários (CORS, rate-limit, auth)
5. Controllers de domínio
6. Fallbacks (`/` redirect)

Quebrar essa ordem pode fazer hooks não dispararem em rotas.
