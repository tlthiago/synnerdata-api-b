import { cron } from "@elysiajs/cron";
import { Elysia } from "elysia";
import { logger } from "@/lib/logger";
import { VacationJobsService } from "@/modules/occurrences/vacations/vacation-jobs.service";
import { JobsService } from "@/modules/payments/jobs/jobs.service";

type CronJobConfig<T> = {
  name: string;
  pattern: string;
  run: () => Promise<T>;
  log: (result: T) => Record<string, unknown>;
};

function createCronJob<T>({ name, pattern, run, log }: CronJobConfig<T>) {
  return cron({
    name,
    pattern,
    async run() {
      const result = await run();
      logger.info({ type: `cron:${name}`, ...log(result) });
    },
  });
}

export const cronPlugin = new Elysia({ name: "cron-jobs" })
  .use(
    createCronJob({
      name: "expire-trials",
      pattern: "0 12 * * *",
      run: () => JobsService.expireTrials(),
      log: (r) => ({ expired: r.expired.length }),
    })
  )
  .use(
    createCronJob({
      name: "notify-expiring-trials",
      pattern: "0 12 * * *",
      run: () => JobsService.notifyExpiringTrials(),
      log: (r) => ({ notified: r.notified.length }),
    })
  )
  .use(
    createCronJob({
      name: "process-scheduled-cancellations",
      pattern: "0 12 * * *",
      run: () => JobsService.processScheduledCancellations(),
      log: (r) => ({ canceled: r.canceled.length }),
    })
  )
  .use(
    createCronJob({
      name: "suspend-expired-grace-periods",
      pattern: "0 */6 * * *",
      run: () => JobsService.suspendExpiredGracePeriods(),
      log: (r) => ({ suspended: r.suspended.length }),
    })
  )
  .use(
    createCronJob({
      name: "process-scheduled-plan-changes",
      pattern: "0 12 * * *",
      run: () => JobsService.processScheduledPlanChanges(),
      log: (r) => ({ executed: r.executed.length, failed: r.failed.length }),
    })
  )
  .use(
    createCronJob({
      name: "activate-scheduled-vacations",
      pattern: "0 3 * * *",
      run: () => VacationJobsService.activateScheduledVacations(),
      log: (r) => ({ updated: r.updated.length }),
    })
  )
  .use(
    createCronJob({
      name: "complete-expired-vacations",
      pattern: "0 3 * * *",
      run: () => VacationJobsService.completeExpiredVacations(),
      log: (r) => ({ updated: r.updated.length }),
    })
  );
