import { logger } from "@/lib/logger";
import { EmployeeHooks } from "./index";

let listenersRegistered = false;

export function registerEmployeeListeners(): void {
  if (listenersRegistered) {
    return;
  }
  listenersRegistered = true;

  EmployeeHooks.on("employee.created", async (payload) => {
    try {
      const { AcquisitionPeriodService } = await import(
        "@/modules/occurrences/vacations/acquisition-periods/acquisition-period.service"
      );
      await AcquisitionPeriodService.generateForEmployee(
        payload.employeeId,
        payload.organizationId,
        payload.hireDate
      );
    } catch (error) {
      logger.error({
        type: "employee:hook:generate-periods",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  EmployeeHooks.on("employee.hireDateUpdated", async (payload) => {
    try {
      const { AcquisitionPeriodService } = await import(
        "@/modules/occurrences/vacations/acquisition-periods/acquisition-period.service"
      );
      await AcquisitionPeriodService.recalculateForEmployee(
        payload.employeeId,
        payload.organizationId,
        payload.newHireDate
      );
    } catch (error) {
      logger.error({
        type: "employee:hook:recalculate-periods",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  logger.info({ type: "employee:listeners:registered" });
}
