/**
 * Valid HTTP error status codes used by AppError subclasses.
 * Exported for future narrowing of domain error base classes (today they
 * declare `status: number`, widening back to number — tracked for a
 * follow-up sweep).
 */
export type HttpErrorStatus = 400 | 401 | 403 | 404 | 409 | 422 | 429 | 500;

export type ErrorResponse = {
  success: false;
  error: {
    code: string;
    message: string;
    requestId?: string;
    details?: unknown;
  };
};

export abstract class AppError extends Error {
  abstract status: number;
  abstract code: string;
  details?: unknown;

  constructor(message: string, details?: unknown) {
    super(message);
    this.name = this.constructor.name;
    this.details = details;
  }

  toResponse(requestId?: string): ErrorResponse {
    const response: ErrorResponse = {
      success: false,
      error: {
        code: this.code,
        message: this.message,
      },
    };

    if (requestId !== undefined) {
      response.error.requestId = requestId;
    }

    if (this.details !== undefined) {
      response.error.details = this.details;
    }

    return response;
  }
}
