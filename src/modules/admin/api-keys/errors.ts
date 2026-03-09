import { AppError } from "@/lib/errors/base-error";

export class ApiKeyError extends AppError {
  status = 400;
  code: string;

  constructor(message: string, code = "API_KEY_ERROR", details?: unknown) {
    super(message, details);
    this.code = code;
  }
}

export class ApiKeyNotFoundError extends ApiKeyError {
  status = 404;

  constructor(keyId: string) {
    super(`Chave de API não encontrada: ${keyId}`, "API_KEY_NOT_FOUND", {
      keyId,
    });
  }
}

export class ApiKeyDisabledError extends ApiKeyError {
  status = 401;

  constructor() {
    super("Chave de API está desabilitada", "API_KEY_DISABLED");
  }
}

export class ApiKeyExpiredError extends ApiKeyError {
  status = 401;

  constructor() {
    super("Chave de API expirada", "API_KEY_EXPIRED");
  }
}

export class ApiKeyRateLimitError extends ApiKeyError {
  status = 429;

  constructor() {
    super(
      "Limite de requisições da chave de API excedido",
      "API_KEY_RATE_LIMIT_EXCEEDED"
    );
  }
}
