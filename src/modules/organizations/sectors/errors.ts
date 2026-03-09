import { AppError } from "@/lib/errors/base-error";

export class SectorError extends AppError {
  status = 400;
  code: string;

  constructor(message: string, code = "SECTOR_ERROR", details?: unknown) {
    super(message, details);
    this.code = code;
  }
}

export class SectorNotFoundError extends SectorError {
  status = 404;

  constructor(sectorId: string) {
    super(`Setor não encontrado: ${sectorId}`, "SECTOR_NOT_FOUND", {
      sectorId,
    });
  }
}

export class SectorAlreadyExistsError extends SectorError {
  status = 409;

  constructor(name: string) {
    super(`Setor com o nome "${name}" já existe`, "SECTOR_ALREADY_EXISTS", {
      name,
    });
  }
}

export class SectorAlreadyDeletedError extends SectorError {
  status = 404;

  constructor(sectorId: string) {
    super(`Setor já deletado: ${sectorId}`, "SECTOR_ALREADY_DELETED", {
      sectorId,
    });
  }
}
