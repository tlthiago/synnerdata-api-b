# Organization Profile (Perfil da Organização)

Metadata, dados fiscais e configurações da organização. Relação 1:1 com organization.

## Business Rules

- Um profile por organização — `ProfileAlreadyExistsError` se tentar criar duplicado
- `taxId` único globalmente (CPF 11 dígitos OU CNPJ 14 dígitos) — validado contra todas as organizações
- `phone` é copiado automaticamente para `mobile` em create e update
- `legalName` default: usa `tradeName` se não fornecido
- Sem soft delete — profiles são permanentes
- Alterações em `taxId` e `email` geram log no `AuditService`

## Billing Integration

- `pagarmeCustomerId` armazena ID do cliente no Pagar.me
- `checkBillingRequirements()` valida completude: profile existe + `taxId` presente + phone/mobile presente
- Retorna `{ complete: boolean, missingFields: string[] }`

## Validations

- `taxId`: 11 dígitos (CPF) ou 14 dígitos (CNPJ)
- `phone`/`mobile`: 10-11 dígitos
- `state`: 2 chars (UF)
- `zipCode`: 8 dígitos
- `revenue`: string numérica com decimais opcionais (`\d+(\.\d{1,2})?`)
- `tradeName`/`legalName`: max 200 chars

## Permissions

- Read: `organization:read`
- Update: `organization:update`

## Errors

- `ProfileNotFoundError` (404)
- `ProfileAlreadyExistsError` (400)
- `TaxIdAlreadyExistsError` (409)
