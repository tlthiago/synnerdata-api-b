import { EmployeeError } from "../errors";

export class EmployeeImportFileTooLargeError extends EmployeeError {
  status = 422;
  constructor(rowCount: number, maxRows: number) {
    super(
      `Arquivo excede o limite de ${maxRows} linhas (encontradas: ${rowCount})`,
      "EMPLOYEE_IMPORT_FILE_TOO_LARGE",
      { rowCount, maxRows }
    );
  }
}

export class EmployeeImportInvalidFileError extends EmployeeError {
  status = 422;
  constructor(message: string) {
    super(message, "EMPLOYEE_IMPORT_INVALID_FILE");
  }
}

export class EmployeeImportLimitExceededError extends EmployeeError {
  status = 422;
  constructor(validCount: number, current: number, limit: number) {
    super(
      `Import de ${validCount} funcionários excede o limite do plano (${current}/${limit})`,
      "EMPLOYEE_IMPORT_LIMIT_EXCEEDED",
      { validCount, current, limit }
    );
  }
}

export class EmployeeImportEmptyFileError extends EmployeeError {
  status = 422;
  constructor() {
    super(
      "Nenhuma linha de dados encontrada no arquivo",
      "EMPLOYEE_IMPORT_EMPTY_FILE"
    );
  }
}

export class EmployeeImportTemplateMissingDataError extends EmployeeError {
  status = 422;
  constructor(missing: string[]) {
    super(
      `Cadastre pelo menos um registro em: ${missing.join(", ")}`,
      "EMPLOYEE_IMPORT_TEMPLATE_MISSING_DATA",
      { missing }
    );
  }
}
