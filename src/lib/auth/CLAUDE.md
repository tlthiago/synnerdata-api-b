# lib/auth

Sub-arquivos internos usados por `src/lib/auth.ts` (entry-point do Better Auth). O arquivo `lib/auth.ts` é a composição `betterAuth({...})` — quando um hook tem corpo relevante, a lógica vive em um sub-arquivo aqui.

## Estrutura

- **`admin-helpers.ts`** — `getAdminEmails()` lê `env.SUPER_ADMIN_EMAILS` / `env.ADMIN_EMAILS`; `handleWelcomeEmail(user)` envia welcome com error-handling local. Chamadas por `databaseHooks.user.create.before` (via `applyAdminRolesBeforeUserCreate`) e por `emailVerification.afterEmailVerification`.
- **`audit-helpers.ts`** — `buildAuditEntry(params)` constrói `AuditLogEntry` tipado (enums `AuditAction`/`AuditResource`) a partir de params flat (`before`/`after` em vez de `changes: {...}`). 9 wrappers `auditXxx` chamam `AuditService.log(buildAuditEntry({...}))` — shape single-source: `auditUserCreate`, `auditLogin`, `auditOrganizationCreate`/`Update`/`Delete`, `auditMemberAdd`/`Remove`/`RoleUpdate`, `auditInvitationAccept`. `buildAuditEntry` também é consumido diretamente por `AnonymizeService` (ação `anonymize` participa da mesma transação).
- **`validators.ts`** — `validateUniqueRole(role, organizationId)` garante role única por org (checa `members` + invitations `pending`). Lança `APIError("BAD_REQUEST", ...)`.
- **`permissions.ts`** — access control do Better Auth: `systemAc`/`systemRoles` (super_admin/admin/user), `orgAc`/`orgRoles` (owner/manager/supervisor/viewer) com `inheritRole()` helper (CP-25), `apiKeyStatements` + `DEFAULT_API_KEY_PERMISSIONS`. Types exportados: `OrgPermissions`, `ApiKeyPermissions`. Consumido por `lib/auth.ts` (config), `plugins/auth-guard/options.ts` (macro auth), `modules/admin/api-keys/` (CRUD de keys) e test helpers.
- **`password-complexity.ts`** — `validatePasswordComplexity(password)` verifica regras (uppercase/lowercase/number/special) e lança `APIError("BAD_REQUEST", { code: "PASSWORD_TOO_WEAK" })`. Chamado pelo hook `emailAndPassword.password.hash` em `lib/auth.ts`. Usa `APIError` do Better Auth (convenção para hooks), não `AppError` do projeto.
- **`hooks.ts`** — callbacks maiores dos hooks do Better Auth extraídos como funções nomeadas:
  - `sendPasswordResetForProvisionOrDefault({ user, url })` — roteia para fluxo de admin-provision ou reset padrão.
  - `activateProvisionOnPasswordReset(user)` — marca provision ativada após reset.
  - `validateUserBeforeDelete(user)` — valida admin/subscription/membros, retorna `organizationId | null`. Lança `BadRequestError` (`AppError`) com códigos estáveis (`ADMIN_ACCOUNT_DELETE_FORBIDDEN`, `ACTIVE_SUBSCRIPTION`, `ORGANIZATION_HAS_MEMBERS`); consumido diretamente por `AnonymizeService` (single source of truth para o invariante "pode ser removido").
  - `applyAdminRolesBeforeUserCreate(user)` — atribui role super_admin/admin via allowlist, auto-verifica email se invitation pendente.
  - `assignInitialActiveOrganizationId(session)` — injeta `activeOrganizationId` no session.create.before.
  - `activateAdminProvisionOnLogin(session)` — marca provision active no primeiro login (silent-fail).
  - `validateCanCreateOrganization(user)` — valida que user role=`user`, sem membership, sem invite pendente.
  - `sendOrganizationInvitationForHook(data)` — monta `inviteLink` e delega para `sendOrganizationInvitationEmail`.
  - `validateBeforeCreateInvitation({ invitation, organization })` — valida role válida, role única, usuário não existe.
  - `triggerAfterCreateOrganizationEffects({ organization, member })` — cria trial, cria minimal profile, audit create. Usa `.catch()` individual em cada side-effect para não quebrar signup.
  - `validateBeforeDeleteOrganization({ organization })` — valida sem membros non-owner e sem subscription paga.

## Regra do `auth` closure

Nenhum arquivo em `lib/auth/` importa `auth` de `lib/auth.ts`. Hooks que precisam chamar `auth.api.*` ficam **inline** em `lib/auth.ts` e delegam a parte validável para um helper aqui.

## Sem barrel

Não há `index.ts`. Imports são sempre diretos para o sub-arquivo:

```ts
import { getAdminEmails } from "@/lib/auth/admin-helpers";
import { auditUserCreate } from "@/lib/auth/audit-helpers";
import { orgRoles, type OrgPermissions } from "@/lib/auth/permissions";
import { validatePasswordComplexity } from "@/lib/auth/password-complexity";
```

O entry-point `@/lib/auth` (ex: `import { auth, AuthSession, AuthUser } from "@/lib/auth"`) permanece como antes — é o arquivo `lib/auth.ts`, que coexiste com este diretório.
