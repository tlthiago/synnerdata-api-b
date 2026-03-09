import { logger } from "@/lib/logger";

let listenersRegistered = false;

export function registerEmployeeListeners(): void {
  if (listenersRegistered) {
    return;
  }
  listenersRegistered = true;
  logger.info({ type: "employee:listeners:registered" });
}
