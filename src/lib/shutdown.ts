import type { Pool } from "pg";
import { logger } from "@/lib/logger";

type ElysiaLike = {
  stop: () => unknown;
};

type ShutdownConfig = {
  app: ElysiaLike;
  pool: Pool;
  gracePeriodMs?: number;
};

let isShuttingDown = false;

export function setupGracefulShutdown(config: ShutdownConfig): void {
  const { app, pool, gracePeriodMs = 5000 } = config;

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
    await Bun.sleep(gracePeriodMs);

    try {
      await pool.end();
      logger.info({ type: "shutdown:db-closed" });
    } catch (error) {
      logger.error({
        type: "shutdown:db-error",
        error: error instanceof Error ? error.message : String(error),
      });
    }

    logger.info({ type: "shutdown:complete" });
    process.exit(0);
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
