# Branches (Filiais)

Unidades/filiais da organização.

## Business Rules

- `taxId` (CNPJ 14 dígitos apenas) — único globalmente entre branches E organization profiles
- `foundedAt` não pode ser no futuro
- `cno` obrigatório (Cadastro Nacional de Obras)

## Audit logging

- Resource key: `branch`
- Mutations logged: create, update, delete (via `AuditService.log` + `buildAuditChanges`)
- PII set extended with `taxId` (CNPJ) — phone/mobile already in default set
- Campos de endereço (`street`, `number`, `neighborhood`, `city`, `state`, `zipCode`) intencionalmente NÃO redacted: branches são entidades corporativas (identificadas por CNPJ), não pessoas naturais; endereço é metadado operacional cujo valor em plaintext tem utilidade investigativa no audit log (ex.: detectar adulteração de endereço cadastrado). Redação degradaria a utilidade do audit sem obrigação correspondente da LGPD.
- Read audit: not enabled

## Required Fields

- `name` (max 255), `taxId` (14 dígitos), `cno`
- Endereço completo: `street`, `number`, `neighborhood`, `city`, `state` (2 chars), `zipCode` (8 dígitos)
- `mobile` (10-11 dígitos)

## Optional Fields

- `complement` (max 100), `phone` (10-11 dígitos), `foundedAt` (ISO date)

## Permissions

- `branch:create` | `branch:read` | `branch:update` | `branch:delete`

## Errors

- `BranchNotFoundError` (404)
- `BranchTaxIdAlreadyExistsError` (409)
- `BranchAlreadyDeletedError` (404)

## User attribution shape

Este módulo segue o pattern canônico de `createdBy`/`updatedBy` como `entityReferenceSchema` (`{ id, name }`), documentado em `src/modules/organizations/cost-centers/CLAUDE.md`.
