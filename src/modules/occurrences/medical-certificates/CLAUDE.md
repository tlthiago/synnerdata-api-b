# Medical Certificates (Atestados Médicos)

Registro de atestados médicos vinculados a ausências.

## Business Rules

- `startDate` deve ser ≤ `endDate`
- `daysOff` deve ser ≥ 1 (inteiro) e deve corresponder exatamente ao intervalo `endDate - startDate + 1` (validado via `calculateDaysBetween` de `src/lib/schemas/date-helpers.ts`). Validado tanto no create quanto no update
- Dados médicos opcionais: `cid` (max 10), `doctorName` (max 255), `doctorCrm` (max 20)
- Overlap check no create: mesmo employee + datas sobrepostas (sem filtro de tipo) lança `MedicalCertificateOverlapError`
- Employee deve estar ativo no create (`ensureEmployeeActive` — rejeita TERMINATED e ON_VACATION)
- Listagem ordenada por `startDate`

## Fields

- `startDate`, `endDate` (YYYY-MM-DD)
- `daysOff` (inteiro, obrigatório)
- `cid`, `doctorName`, `doctorCrm` (opcionais)
- `notes` (opcional)

## Errors

- `MedicalCertificateNotFoundError` (404)
- `MedicalCertificateAlreadyDeletedError` (404)
- `MedicalCertificateInvalidDateRangeError` (422)
- `MedicalCertificateInvalidDaysOffError` (422)
- `MedicalCertificateInvalidEmployeeError` (422)
- `MedicalCertificateOverlapError` (409) — same employee + overlapping dates
- `EmployeeTerminatedError` (422) — shared, from `src/lib/errors/employee-status-errors.ts`
- `EmployeeOnVacationError` (422) — shared, from `src/lib/errors/employee-status-errors.ts`
