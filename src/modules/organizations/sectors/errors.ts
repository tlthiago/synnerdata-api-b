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
    super(`Sector not found: ${sectorId}`, "SECTOR_NOT_FOUND", { sectorId });
  }
}

export class SectorAlreadyDeletedError extends SectorError {
  status = 404;

  constructor(sectorId: string) {
    super(`Sector already deleted: ${sectorId}`, "SECTOR_ALREADY_DELETED", {
      sectorId,
    });
  }
}
