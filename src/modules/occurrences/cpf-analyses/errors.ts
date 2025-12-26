import { AppError } from "@/lib/errors/base-error";

export class CpfAnalysisError extends AppError {
  status = 400;
  code: string;

  constructor(message: string, code = "CPF_ANALYSIS_ERROR", details?: unknown) {
    super(message, details);
    this.code = code;
  }
}

export class CpfAnalysisNotFoundError extends CpfAnalysisError {
  status = 404;

  constructor(cpfAnalysisId: string) {
    super(
      `CPF analysis not found: ${cpfAnalysisId}`,
      "CPF_ANALYSIS_NOT_FOUND",
      { cpfAnalysisId }
    );
  }
}

export class CpfAnalysisAlreadyDeletedError extends CpfAnalysisError {
  status = 404;

  constructor(cpfAnalysisId: string) {
    super(
      `CPF analysis already deleted: ${cpfAnalysisId}`,
      "CPF_ANALYSIS_ALREADY_DELETED",
      { cpfAnalysisId }
    );
  }
}

export class CpfAnalysisInvalidEmployeeError extends CpfAnalysisError {
  status = 422;

  constructor(employeeId: string) {
    super(
      `Funcionário inválido: ${employeeId}`,
      "CPF_ANALYSIS_INVALID_EMPLOYEE",
      { employeeId }
    );
  }
}
