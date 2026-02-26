import { cron } from "@elysiajs/cron";
import { Elysia } from "elysia";
import { logger } from "@/lib/logger";
import { JobsService } from "@/modules/payments/jobs/jobs.service";

export const cronPlugin = new Elysia({ name: "cron-jobs" })
  .use(
    cron({
      name: "expire-trials",
      pattern: "0 12 * * *", // 12:00 UTC = 09:00 BRT
      async run() {
        const result = await JobsService.expireTrials();
        logger.info({
          type: "cron:expire-trials",
          expired: result.expired.length,
        });
      },
    })
  )
  .use(
    cron({
      name: "notify-expiring-trials",
      pattern: "0 12 * * *", // 12:00 UTC = 09:00 BRT
      async run() {
        const result = await JobsService.notifyExpiringTrials();
        logger.info({
          type: "cron:notify-expiring-trials",
          notified: result.notified.length,
        });
      },
    })
  )
  .use(
    cron({
      name: "process-scheduled-cancellations",
      pattern: "0 12 * * *", // 12:00 UTC = 09:00 BRT
      async run() {
        const result = await JobsService.processScheduledCancellations();
        logger.info({
          type: "cron:process-scheduled-cancellations",
          canceled: result.canceled.length,
        });
      },
    })
  )
  .use(
    cron({
      name: "suspend-expired-grace-periods",
      pattern: "0 */6 * * *", // Every 6 hours
      async run() {
        const result = await JobsService.suspendExpiredGracePeriods();
        logger.info({
          type: "cron:suspend-expired-grace-periods",
          suspended: result.suspended.length,
        });
      },
    })
  )
  .use(
    cron({
      name: "process-scheduled-plan-changes",
      pattern: "0 12 * * *", // 12:00 UTC = 09:00 BRT
      async run() {
        const result = await JobsService.processScheduledPlanChanges();
        logger.info({
          type: "cron:process-scheduled-plan-changes",
          executed: result.executed.length,
          failed: result.failed.length,
        });
      },
    })
  );
