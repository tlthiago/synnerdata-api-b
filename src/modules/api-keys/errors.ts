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
    super(`API key not found: ${keyId}`, "API_KEY_NOT_FOUND", { keyId });
  }
}

export class ApiKeyDisabledError extends ApiKeyError {
  status = 401;

  constructor() {
    super("API key is disabled", "API_KEY_DISABLED");
  }
}

export class ApiKeyExpiredError extends ApiKeyError {
  status = 401;

  constructor() {
    super("API key has expired", "API_KEY_EXPIRED");
  }
}

export class ApiKeyRateLimitError extends ApiKeyError {
  status = 429;

  constructor() {
    super("API key rate limit exceeded", "API_KEY_RATE_LIMIT_EXCEEDED");
  }
}
