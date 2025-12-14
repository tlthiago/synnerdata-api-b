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
          expired: result.data.expired.length,
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
          notified: result.data.notified.length,
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
          canceled: result.data.canceled.length,
        });
      },
    })
  );
