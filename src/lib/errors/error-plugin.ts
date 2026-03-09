import { Elysia } from "elysia";
import { logger } from "@/lib/logger";
import { captureException } from "@/lib/sentry";
import { AppError } from "./base-error";

const isDev = process.env.NODE_ENV !== "production";

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

function formatErrorDetail(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    const detail: Record<string, unknown> = {
      name: error.name,
      message: error.message,
      stack: isDev ? error.stack : undefined,
    };

    // Drizzle ORM and other libraries wrap the real error in .cause
    if (error.cause) {
      detail.cause = formatErrorDetail(error.cause);
    }

    return detail;
  }
  return { message: String(error) };
}

export const errorPlugin = new Elysia({ name: "error-handler" })
  .error({ AppError })
  .onError({ as: "global" }, ({ code, error, set }) => {
    // Custom AppError instances
    if (error instanceof AppError) {
      // Report 5xx AppErrors to Sentry/GlitchTip
      if (error.status >= 500) {
        captureException(error);
        logger.error({
          type: "app:error:5xx",
          code: error.code,
          message: error.message,
          details: error.details,
          stack: isDev ? error.stack : undefined,
        });
      }
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
          message: "Dados de requisição inválidos",
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

    // Unhandled errors — report to Sentry/GlitchTip and log with full detail
    captureException(error);

    const errorDetail = formatErrorDetail(error);
    logger.error({ type: "unhandled:error", error: errorDetail });

    // Write directly to stderr to guarantee terminal visibility
    const errMsg =
      error instanceof Error
        ? `${error.name}: ${error.message}${error.cause instanceof Error ? `\n  Caused by: ${error.cause.message}` : ""}${isDev && error.stack ? `\n${error.stack}` : ""}`
        : String(error);
    process.stderr.write(`\n[UNHANDLED ERROR] ${errMsg}\n\n`);

    set.status = 500;
    return {
      success: false as const,
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred",
        // In development, expose the real error to help debugging
        ...(isDev && { cause: errorDetail }),
      },
    };
  })
  .as("scoped");
