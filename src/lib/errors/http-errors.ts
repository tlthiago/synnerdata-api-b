import { AppError } from "./base-error";

export class NotFoundError extends AppError {
  status = 404 as const;
  code = "NOT_FOUND";

  constructor(resource: string, id?: string) {
    super(
      id ? `${resource} with id '${id}' not found` : `${resource} not found`
    );
  }
}

export class UnauthorizedError extends AppError {
  status = 401 as const;
  code = "UNAUTHORIZED";

  constructor(message = "Authentication required") {
    super(message);
  }
}

export class ForbiddenError extends AppError {
  status = 403 as const;
  code = "FORBIDDEN";

  constructor(message = "Access denied") {
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

  constructor(message = "An unexpected error occurred") {
    super(message);
  }
}

export class RateLimitedError extends AppError {
  status = 429 as const;
  code = "RATE_LIMITED";

  constructor(message = "Too many requests") {
    super(message);
  }
}
