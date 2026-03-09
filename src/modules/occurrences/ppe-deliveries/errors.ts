import { AppError } from "@/lib/errors/base-error";

export class PpeDeliveryError extends AppError {
  status = 400;
  code: string;

  constructor(message: string, code = "PPE_DELIVERY_ERROR", details?: unknown) {
    super(message, details);
    this.code = code;
  }
}

export class PpeDeliveryNotFoundError extends PpeDeliveryError {
  status = 404;

  constructor(ppeDeliveryId: string) {
    super(
      `Entrega de EPI não encontrada: ${ppeDeliveryId}`,
      "PPE_DELIVERY_NOT_FOUND",
      { ppeDeliveryId }
    );
  }
}

export class PpeDeliveryAlreadyDeletedError extends PpeDeliveryError {
  status = 404;

  constructor(ppeDeliveryId: string) {
    super(
      `Entrega de EPI já deletada: ${ppeDeliveryId}`,
      "PPE_DELIVERY_ALREADY_DELETED",
      { ppeDeliveryId }
    );
  }
}

export class PpeDeliveryItemNotFoundError extends PpeDeliveryError {
  status = 404;

  constructor(ppeDeliveryId: string, ppeItemId: string) {
    super(
      "Associação de item de EPI não encontrada",
      "PPE_DELIVERY_ITEM_NOT_FOUND",
      {
        ppeDeliveryId,
        ppeItemId,
      }
    );
  }
}

export class PpeDeliveryItemAlreadyExistsError extends PpeDeliveryError {
  status = 409;

  constructor(ppeDeliveryId: string, ppeItemId: string) {
    super(
      "Item de EPI já associado a esta entrega",
      "PPE_DELIVERY_ITEM_ALREADY_EXISTS",
      { ppeDeliveryId, ppeItemId }
    );
  }
}

export class PpeDeliveryEmployeeNotFoundError extends PpeDeliveryError {
  status = 404;

  constructor(employeeId: string) {
    super(`Funcionário não encontrado: ${employeeId}`, "EMPLOYEE_NOT_FOUND", {
      employeeId,
    });
  }
}

export class PpeDeliveryPpeItemNotFoundError extends PpeDeliveryError {
  status = 404;

  constructor(ppeItemId: string) {
    super(`Item de EPI não encontrado: ${ppeItemId}`, "PPE_ITEM_NOT_FOUND", {
      ppeItemId,
    });
  }
}
