# Public Module

Endpoints públicos (sem autenticação). Composite controller sem prefix próprio — sub-controllers definem `/v1/public/<nome>`.

## Sub-módulos

### Contact (`contact/`)

Formulário de contato do site.

- **Endpoint**: `POST /v1/public/contact`
- **Sem autenticação**
- Delega envio para `sendContactEmail()` de `src/lib/email`
- Resposta: `wrapMessage()` (sem data, apenas message)
- **Campos**: `name` (1-255), `email`, `company` (1-255), `phone` (10-11 dígitos, opcional), `subject` (1-255), `message` (10-5000)

### Newsletter (`newsletter/`)

Inscrição na newsletter.

- **Endpoint**: `POST /v1/public/newsletter/subscribe`
- **Sem autenticação**
- Email duplicado ativo → `ConflictError` (409)
- Email previamente cancelado (`status !== "active"`) → reativado (sem erro)
- Novo email → insere com `status: "active"` e ID `newsletter-<uuid>`
- Resposta: `wrapMessage()` (sem data, apenas message)
- **Campos**: `email`

## Padrões

- Nenhum endpoint usa `betterAuthPlugin` — são totalmente públicos
- OpenAPI tags seguem `Public - <Sub-módulo>` (e.g., `Public - Contact`, `Public - Newsletter`)
- Respostas usam `messageOnlyResponseSchema` em vez de `successResponseSchema`
- Erros usam classes genéricas de `src/lib/errors/` (sem errors.ts próprio)
