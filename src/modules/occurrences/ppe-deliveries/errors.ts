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
      `PPE delivery not found: ${ppeDeliveryId}`,
      "PPE_DELIVERY_NOT_FOUND",
      { ppeDeliveryId }
    );
  }
}

export class PpeDeliveryAlreadyDeletedError extends PpeDeliveryError {
  status = 404;

  constructor(ppeDeliveryId: string) {
    super(
      `PPE delivery already deleted: ${ppeDeliveryId}`,
      "PPE_DELIVERY_ALREADY_DELETED",
      { ppeDeliveryId }
    );
  }
}

export class PpeDeliveryItemNotFoundError extends PpeDeliveryError {
  status = 404;

  constructor(ppeDeliveryId: string, ppeItemId: string) {
    super("PPE item association not found", "PPE_DELIVERY_ITEM_NOT_FOUND", {
      ppeDeliveryId,
      ppeItemId,
    });
  }
}

export class PpeDeliveryItemAlreadyExistsError extends PpeDeliveryError {
  status = 409;

  constructor(ppeDeliveryId: string, ppeItemId: string) {
    super(
      "PPE item already associated with this delivery",
      "PPE_DELIVERY_ITEM_ALREADY_EXISTS",
      { ppeDeliveryId, ppeItemId }
    );
  }
}

export class PpeDeliveryEmployeeNotFoundError extends PpeDeliveryError {
  status = 404;

  constructor(employeeId: string) {
    super(`Employee not found: ${employeeId}`, "EMPLOYEE_NOT_FOUND", {
      employeeId,
    });
  }
}

export class PpeDeliveryPpeItemNotFoundError extends PpeDeliveryError {
  status = 404;

  constructor(ppeItemId: string) {
    super(`PPE item not found: ${ppeItemId}`, "PPE_ITEM_NOT_FOUND", {
      ppeItemId,
    });
  }
}
