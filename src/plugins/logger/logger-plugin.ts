import { Elysia } from "elysia";
import { generateRequestId, logger, shouldIgnore } from "@/lib/logger";
import { enterRequestContext, getRequestId } from "@/lib/request-context";

export type LoggerContext = {
  requestId: string;
  requestStart: number;
};

export const loggerPlugin = new Elysia({ name: "logger" })
  .onRequest(({ set }) => {
    const requestId = generateRequestId();
    enterRequestContext({ requestId });
    set.headers["X-Request-ID"] = requestId;
  })
  .derive({ as: "global" }, () => ({
    requestId: getRequestId() as string,
    requestStart: performance.now(),
  }))
  .onAfterResponse({ as: "global" }, ({ request, requestStart, set }) => {
    const pathname = new URL(request.url).pathname;
    if (shouldIgnore(pathname)) {
      return;
    }

    const duration = Math.round(performance.now() - requestStart);
    const status = typeof set.status === "number" ? set.status : 200;

    logger.info(
      {
        method: request.method,
        path: pathname,
        status,
        duration: `${duration}ms`,
      },
      "request completed"
    );
  });
