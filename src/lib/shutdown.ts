import type { Pool } from "pg";
import { logger } from "@/lib/logger";

type ElysiaLike = {
  stop: () => unknown;
};

type ShutdownConfig = {
  app: ElysiaLike;
  pool: Pool;
  gracePeriodMs?: number;
  dbCloseTimeoutMs?: number;
};

const DEFAULT_DB_CLOSE_TIMEOUT_MS = 5000;

let isShuttingDown = false;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

export function setupGracefulShutdown(config: ShutdownConfig): void {
  const {
    app,
    pool,
    gracePeriodMs = 5000,
    dbCloseTimeoutMs = DEFAULT_DB_CLOSE_TIMEOUT_MS,
  } = config;

  const shutdown = async (signal: string): Promise<void> => {
    if (isShuttingDown) {
      logger.warn({ type: "shutdown:duplicate", signal });
      return;
    }
    isShuttingDown = true;

    logger.info({ type: "shutdown:start", signal });

    app.stop();
    logger.info({ type: "shutdown:server-stopped" });

    logger.info({
      type: "shutdown:grace-period",
      durationMs: gracePeriodMs,
    });
    await sleep(gracePeriodMs);

    let dbClosedCleanly = true;
    try {
      await withTimeout(pool.end(), dbCloseTimeoutMs, "pool.end");
      logger.info({ type: "shutdown:db-closed" });
    } catch (error) {
      dbClosedCleanly = false;
      logger.error({
        type: "shutdown:db-error",
        error: error instanceof Error ? error.message : String(error),
      });
    }

    logger.info({
      type: "shutdown:complete",
      dbClosedCleanly,
    });
    process.exit(dbClosedCleanly ? 0 : 1);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  logger.debug({ type: "shutdown:handlers-registered" });
}

export function resetShutdownState(): void {
  isShuttingDown = false;
}

export function getShutdownState(): boolean {
  return isShuttingDown;
}
