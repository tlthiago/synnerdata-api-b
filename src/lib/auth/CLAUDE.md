# lib/auth

Sub-arquivos internos usados por `src/lib/auth.ts` (entry-point do Better Auth). O arquivo `lib/auth.ts` é a composição `betterAuth({...})` — quando um hook tem corpo relevante, a lógica vive em um sub-arquivo aqui.

## Estrutura

- **`admin-helpers.ts`** — `getAdminEmails()` lê `env.SUPER_ADMIN_EMAILS` / `env.ADMIN_EMAILS`; `handleWelcomeEmail(user)` envia welcome com error-handling local. Chamadas por `databaseHooks.user.create.before` (via `applyAdminRolesBeforeUserCreate`) e por `emailVerification.afterEmailVerification`.
- **`audit-helpers.ts`** — 10 funções `auditXxx` disparando `AuditService.log` com shape padronizado: `auditUserCreate`, `auditUserDelete`, `auditLogin`, `auditOrganizationCreate`/`Update`/`Delete`, `auditMemberAdd`/`Remove`/`RoleUpdate`, `auditInvitationAccept`. **CP-33** (S, próximo) vai consolidar em `buildAuditEntry(...)`.
- **`validators.ts`** — `validateUniqueRole(role, organizationId)` garante role única por org (checa `members` + invitations `pending`). Lança `APIError("BAD_REQUEST", ...)`.
- **`hooks.ts`** — callbacks maiores dos hooks do Better Auth extraídos como funções nomeadas:
  - `sendPasswordResetForProvisionOrDefault({ user, url })` — roteia para fluxo de admin-provision ou reset padrão.
  - `activateProvisionOnPasswordReset(user)` — marca provision ativada após reset.
  - `validateUserBeforeDelete(user)` — valida admin/subscription/membros, retorna `organizationId | null`. A chamada `auth.api.deleteOrganization` fica **inline em `lib/auth.ts`** (evita circular).
  - `applyAdminRolesBeforeUserCreate(user)` — atribui role super_admin/admin via allowlist, auto-verifica email se invitation pendente.
  - `assignInitialActiveOrganizationId(session)` — injeta `activeOrganizationId` no session.create.before.
  - `activateAdminProvisionOnLogin(session)` — marca provision active no primeiro login (silent-fail).
  - `validateCanCreateOrganization(user)` — valida que user role=`user`, sem membership, sem invite pendente.
  - `sendOrganizationInvitationForHook(data)` — monta `inviteLink` e delega para `sendOrganizationInvitationEmail`.
  - `validateBeforeCreateInvitation({ invitation, organization })` — valida role válida, role única, usuário não existe.
  - `triggerAfterCreateOrganizationEffects({ organization, member })` — cria trial, cria minimal profile, audit create. Usa `.catch()` individual em cada side-effect para não quebrar signup.
  - `validateBeforeDeleteOrganization({ organization })` — valida sem membros non-owner e sem subscription paga.

## Regra do `auth` closure

Nenhum arquivo em `lib/auth/` importa `auth` de `lib/auth.ts`. Hooks que precisam chamar `auth.api.*` (ex: `beforeDelete` → `auth.api.deleteOrganization`) ficam **inline** em `lib/auth.ts` e delegam a parte validável para um helper aqui.

## Sem barrel

Não há `index.ts`. Imports são sempre diretos para o sub-arquivo:

```ts
import { getAdminEmails } from "@/lib/auth/admin-helpers";
import { auditUserCreate } from "@/lib/auth/audit-helpers";
```

O entry-point `@/lib/auth` (ex: `import { auth, AuthSession, AuthUser } from "@/lib/auth"`) permanece como antes — é o arquivo `lib/auth.ts`, que coexiste com este diretório.
