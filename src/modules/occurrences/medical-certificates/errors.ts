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
      `Atestado médico não encontrado: ${medicalCertificateId}`,
      "MEDICAL_CERTIFICATE_NOT_FOUND",
      { medicalCertificateId }
    );
  }
}

export class MedicalCertificateAlreadyDeletedError extends MedicalCertificateError {
  status = 404;

  constructor(medicalCertificateId: string) {
    super(
      `Atestado médico já deletado: ${medicalCertificateId}`,
      "MEDICAL_CERTIFICATE_ALREADY_DELETED",
      { medicalCertificateId }
    );
  }
}

export class MedicalCertificateInvalidDateRangeError extends MedicalCertificateError {
  status = 422;

  constructor() {
    super(
      "Data inicial deve ser anterior ou igual à data final",
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
      "Funcionário já possui um atestado médico sobrepondo este período",
      "MEDICAL_CERTIFICATE_OVERLAP",
      { employeeId, startDate, endDate }
    );
  }
}
