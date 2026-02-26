# Warnings (Advertências Disciplinares)

Registro de advertências e suspensões disciplinares.

## Business Rules

- `reason` obrigatório
- Rastreamento de ciência: `acknowledged` (boolean, default false) + `acknowledgedAt` (datetime opcional)
- `acknowledgedAt` convertido de string para Date no service
- Listagem ordenada por `date`

## Enums

- type: `verbal` | `written` | `suspension`

## Fields

- `date` (YYYY-MM-DD)
- `reason` (obrigatório), `description` (opcional)
- `witnessName` (opcional)
- `acknowledged`, `acknowledgedAt`
- `notes` (opcional)

## Errors

- `WarningNotFoundError` (404)
- `WarningAlreadyDeletedError` (404)
- `WarningInvalidEmployeeError` (422)
