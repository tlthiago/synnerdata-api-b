# Branches (Filiais)

Unidades/filiais da organização.

## Business Rules

- `taxId` (CNPJ 14 dígitos apenas) — único globalmente entre branches E organization profiles
- `foundedAt` não pode ser no futuro
- `cno` obrigatório (Cadastro Nacional de Obras)

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
