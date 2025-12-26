import { AppError } from "@/lib/errors/base-error";

export class MedicalCertificateError extends AppError {
  status = 400;
  code: string;

  constructor(
    message: string,
    code = "MEDICAL_CERTIFICATE_ERROR",
    details?: unknown
  ) {
    super(message, details);
    this.code = code;
  }
}

export class MedicalCertificateNotFoundError extends MedicalCertificateError {
  status = 404;

  constructor(medicalCertificateId: string) {
    super(
      `Medical certificate not found: ${medicalCertificateId}`,
      "MEDICAL_CERTIFICATE_NOT_FOUND",
      { medicalCertificateId }
    );
  }
}

export class MedicalCertificateAlreadyDeletedError extends MedicalCertificateError {
  status = 404;

  constructor(medicalCertificateId: string) {
    super(
      `Medical certificate already deleted: ${medicalCertificateId}`,
      "MEDICAL_CERTIFICATE_ALREADY_DELETED",
      { medicalCertificateId }
    );
  }
}

export class InvalidDateRangeError extends MedicalCertificateError {
  constructor() {
    super(
      "Start date must be before or equal to end date",
      "INVALID_DATE_RANGE"
    );
  }
}

export class InvalidDaysOffError extends MedicalCertificateError {
  constructor() {
    super("Days off must be a positive number", "INVALID_DAYS_OFF");
  }
}

export class MedicalCertificateInvalidEmployeeError extends MedicalCertificateError {
  status = 422;

  constructor(employeeId: string) {
    super(
      `Funcionário inválido: ${employeeId}`,
      "MEDICAL_CERTIFICATE_INVALID_EMPLOYEE",
      {
        employeeId,
      }
    );
  }
}
