import { Elysia } from "elysia";
import { logger } from "@/lib/logger";
import { AppError } from "./base-error";

type ValidationIssue = {
  path: string;
  message: string;
};

type ElysiaValidationError = {
  path?: string;
  message?: string;
  summary?: string;
};

function formatValidationErrors(errors: unknown[]): ValidationIssue[] {
  return errors.map((err) => {
    const error = err as ElysiaValidationError;
    return {
      path: error.path ?? "",
      message: error.message ?? error.summary ?? "Invalid value",
    };
  });
}

export const errorPlugin = new Elysia({ name: "error-handler" })
  .error({ AppError })
  .onError(({ code, error, set }) => {
    // Custom AppError instances
    if (error instanceof AppError) {
      set.status = error.status;
      return error.toResponse();
    }

    // Elysia validation errors
    if (code === "VALIDATION") {
      set.status = 422;
      return {
        success: false as const,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request data",
          details: formatValidationErrors(error.all),
        },
      };
    }

    // Route not found
    if (code === "NOT_FOUND") {
      set.status = 404;
      return {
        success: false as const,
        error: {
          code: "NOT_FOUND",
          message: "Route not found",
        },
      };
    }

    // Unhandled errors
    logger.error({
      type: "unhandled:error",
      error:
        error instanceof Error
          ? { name: error.name, message: error.message, stack: error.stack }
          : { message: String(error) },
    });
    set.status = 500;
    return {
      success: false as const,
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred",
      },
    };
  })
  .as("scoped");
