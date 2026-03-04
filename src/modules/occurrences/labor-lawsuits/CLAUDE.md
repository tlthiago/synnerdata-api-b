# Labor Lawsuits (Processos Trabalhistas)

Registro e acompanhamento de processos trabalhistas.

## Business Rules

- `processNumber` (max 25), `court` (max 255), `plaintiff`, `defendant` — obrigatórios
- `filingDate` e `knowledgeDate` obrigatórios (ISO date), não podem ser no futuro
- `conclusionDate` opcional (ISO date), não pode ser no futuro
- `knowledgeDate >= filingDate` e `conclusionDate >= filingDate` (validação cruzada)
- `claimAmount` e `costsExpenses` — números positivos opcionais, armazenados como string no DB, convertidos para number na leitura
- Fluxo: abertura (`filingDate`) → conhecimento (`knowledgeDate`) → conclusão (`conclusionDate`) com recursos (`appeals`) e custas (`costsExpenses`)
- Listagem suporta filtro por `employeeId` e ordenada por `filingDate` DESC

## Data Conventions

- Campos monetários (`claimAmount`, `costsExpenses`): `number` na API, `string` no banco

## Errors

- `LaborLawsuitNotFoundError` (404)
- `LaborLawsuitAlreadyDeletedError` (404)
- `LaborLawsuitEmployeeNotFoundError` (404)
- `LaborLawsuitInvalidDateOrderError` (422)
