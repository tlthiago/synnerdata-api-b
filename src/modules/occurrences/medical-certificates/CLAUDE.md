# Medical Certificates (Atestados Médicos)

Registro de atestados médicos vinculados a ausências.

## Business Rules

- `startDate` deve ser ≤ `endDate`
- `daysOff` deve ser ≥ 1 (inteiro)
- Dados médicos opcionais: `cid` (max 10), `doctorName` (max 255), `doctorCrm` (max 20)
- Listagem ordenada por `startDate`

## Fields

- `startDate`, `endDate` (YYYY-MM-DD)
- `daysOff` (inteiro, obrigatório)
- `cid`, `doctorName`, `doctorCrm` (opcionais)
- `notes` (opcional)

## Errors

- `MedicalCertificateNotFoundError` (404)
- `MedicalCertificateAlreadyDeletedError` (404)
- `InvalidDateRangeError` (422)
- `InvalidDaysOffError` (422)
- `MedicalCertificateInvalidEmployeeError` (422)
