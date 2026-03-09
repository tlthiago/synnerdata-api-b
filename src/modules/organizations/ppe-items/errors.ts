import { AppError } from "@/lib/errors/base-error";

export class PpeItemError extends AppError {
  status = 400;
  code: string;

  constructor(message: string, code = "PPE_ITEM_ERROR", details?: unknown) {
    super(message, details);
    this.code = code;
  }
}

export class PpeItemNotFoundError extends PpeItemError {
  status = 404;

  constructor(ppeItemId: string) {
    super(`Item de EPI não encontrado: ${ppeItemId}`, "PPE_ITEM_NOT_FOUND", {
      ppeItemId,
    });
  }
}

export class PpeItemAlreadyExistsError extends PpeItemError {
  status = 409;

  constructor(name: string, equipment: string) {
    super(
      `Item de EPI com o nome "${name}" e equipamento "${equipment}" já existe`,
      "PPE_ITEM_ALREADY_EXISTS",
      { name, equipment }
    );
  }
}

export class PpeItemAlreadyDeletedError extends PpeItemError {
  status = 404;

  constructor(ppeItemId: string) {
    super(`Item de EPI já deletado: ${ppeItemId}`, "PPE_ITEM_ALREADY_DELETED", {
      ppeItemId,
    });
  }
}

export class PpeJobPositionNotFoundError extends PpeItemError {
  status = 404;

  constructor(ppeItemId: string, jobPositionId: string) {
    super("Associação com cargo não encontrada", "PPE_JOB_POSITION_NOT_FOUND", {
      ppeItemId,
      jobPositionId,
    });
  }
}

export class PpeJobPositionAlreadyExistsError extends PpeItemError {
  status = 409;

  constructor(ppeItemId: string, jobPositionId: string) {
    super(
      "Cargo já associado a este item de EPI",
      "PPE_JOB_POSITION_ALREADY_EXISTS",
      { ppeItemId, jobPositionId }
    );
  }
}
