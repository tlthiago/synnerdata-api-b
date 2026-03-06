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

export class MedicalCertificateInvalidDateRangeError extends MedicalCertificateError {
  status = 422;

  constructor() {
    super(
      "Start date must be before or equal to end date",
      "INVALID_DATE_RANGE"
    );
  }
}

export class MedicalCertificateInvalidDaysOffError extends MedicalCertificateError {
  status = 422;

  constructor(expected: number, received: number) {
    super(
      `Dias de afastamento informado (${received}) não corresponde ao intervalo de datas (${expected})`,
      "INVALID_DAYS_OFF",
      { expected, received }
    );
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

export class MedicalCertificateOverlapError extends MedicalCertificateError {
  status = 409;

  constructor(employeeId: string, startDate: string, endDate: string) {
    super(
      "Employee already has a medical certificate overlapping this period",
      "MEDICAL_CERTIFICATE_OVERLAP",
      { employeeId, startDate, endDate }
    );
  }
}
