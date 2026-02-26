# CPF Analyses (Análises de CPF)

Registro de análises de CPF com scoring de risco.

## Business Rules

- `analysisDate` não pode ser no futuro
- `score` (inteiro ≥ 0, opcional) com `riskLevel` associado
- `externalReference` (max 255, opcional) — referência de sistema externo
- Fluxo de status: `pending` → `approved` | `rejected` | `review`
- Listagem ordenada por `analysisDate`

## Enums

- status: `pending` | `approved` | `rejected` | `review`
- riskLevel: `low` | `medium` | `high`

## Fields

- `analysisDate` (YYYY-MM-DD, não futuro)
- `score` (inteiro, opcional), `riskLevel` (opcional)
- `observations` (max 1000, opcional), `externalReference` (max 255, opcional)

## Errors

- `CpfAnalysisNotFoundError` (404)
- `CpfAnalysisAlreadyDeletedError` (404)
- `CpfAnalysisInvalidEmployeeError` (422)
