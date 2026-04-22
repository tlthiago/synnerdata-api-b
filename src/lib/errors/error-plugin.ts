import { Elysia } from "elysia";
import { logger } from "@/lib/logger";
import { getRequestId } from "@/lib/request-context";
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

const MAX_ERROR_DETAIL_DEPTH = 5;

export function formatErrorDetail(
  error: unknown,
  depth = 0
): Record<string, unknown> {
  if (error instanceof Error) {
    const detail: Record<string, unknown> = {
      name: error.name,
      message: error.message,
      stack: isDev ? error.stack : undefined,
    };

    if (error.cause) {
      detail.cause =
        depth >= MAX_ERROR_DETAIL_DEPTH
          ? `[truncated: max depth ${MAX_ERROR_DETAIL_DEPTH} reached]`
          : formatErrorDetail(error.cause, depth + 1);
    }

    return detail;
  }
  return { message: String(error) };
}

export const errorPlugin = new Elysia({ name: "error-handler" })
  .error({ AppError })
  .onError({ as: "global" }, ({ code, error, set, request }) => {
    const requestId = getRequestId() as string;

    if (error instanceof AppError) {
      if (error.status >= 500) {
        captureException(error);
        const pathname = new URL(request.url).pathname;
        logger.error(
          {
            method: request.method,
            path: pathname,
            code: error.code,
            details: error.details,
            stack: isDev ? error.stack : undefined,
          },
          error.message
        );
      }
      set.status = error.status;
      return error.toResponse(requestId);
    }

    if (code === "VALIDATION") {
      set.status = 422;
      return {
        success: false as const,
        error: {
          code: "VALIDATION_ERROR",
          message: "Dados de requisição inválidos",
          requestId,
          details: formatValidationErrors(error.all),
        },
      };
    }

    if (code === "NOT_FOUND") {
      set.status = 404;
      return {
        success: false as const,
        error: {
          code: "NOT_FOUND",
          message: "Rota não encontrada",
          requestId,
        },
      };
    }

    captureException(error);

    const errorDetail = formatErrorDetail(error);
    const pathname = new URL(request.url).pathname;
    logger.error(
      {
        method: request.method,
        path: pathname,
        error: errorDetail,
      },
      "unhandled error"
    );

    set.status = 500;
    return {
      success: false as const,
      error: {
        code: "INTERNAL_ERROR",
        message: "Ocorreu um erro inesperado",
        requestId,
        ...(isDev && { cause: errorDetail }),
      },
    };
  })
  .as("scoped");
