import { AppError } from "./base-error";

export class NotFoundError extends AppError {
  status = 404 as const;
  code = "NOT_FOUND";

  constructor(resource: string, id?: string) {
    super(
      id
        ? `${resource} com id '${id}' não encontrado(a)`
        : `${resource} não encontrado(a)`
    );
  }
}

export class UnauthorizedError extends AppError {
  status = 401 as const;
  code = "UNAUTHORIZED";

  constructor(message = "Autenticação necessária") {
    super(message);
  }
}

export class ForbiddenError extends AppError {
  status = 403 as const;
  code = "FORBIDDEN";

  constructor(message = "Acesso negado") {
    super(message);
  }
}

export class ValidationError extends AppError {
  status = 400 as const;
  code = "VALIDATION_ERROR";
}

export class ConflictError extends AppError {
  status = 409 as const;
  code = "CONFLICT";
}

export class InternalError extends AppError {
  status = 500 as const;
  code = "INTERNAL_ERROR";

  constructor(message = "Ocorreu um erro inesperado") {
    super(message);
  }
}

export class RateLimitedError extends AppError {
  status = 429 as const;
  code = "RATE_LIMITED";

  constructor(message = "Muitas requisições. Tente novamente mais tarde") {
    super(message);
  }
}
