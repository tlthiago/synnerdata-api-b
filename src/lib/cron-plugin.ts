import { cron } from "@elysiajs/cron";
import { Elysia } from "elysia";
import { JobsService } from "@/modules/payments/jobs/jobs.service";

export const cronPlugin = new Elysia({ name: "cron-jobs" })
  .use(
    cron({
      name: "expire-trials",
      pattern: "0 12 * * *", // 12:00 UTC = 09:00 BRT
      async run() {
        const result = await JobsService.expireTrials();
        console.log(`[Cron] Expired ${result.expired.length} trials`);
      },
    })
  )
  .use(
    cron({
      name: "notify-expiring-trials",
      pattern: "0 12 * * *", // 12:00 UTC = 09:00 BRT
      async run() {
        const result = await JobsService.notifyExpiringTrials();
        console.log(
          `[Cron] Notified ${result.notified.length} expiring trials`
        );
      },
    })
  );
