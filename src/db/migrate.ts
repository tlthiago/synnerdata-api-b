import { migrate } from "drizzle-orm/node-postgres/migrator";
import { logger } from "../lib/logger";
import { db, pool } from ".";

try {
  const start = performance.now();
  await migrate(db, { migrationsFolder: "./src/db/migrations" });
  const duration = Math.round(performance.now() - start);
  logger.info({
    type: "db:migrate",
    message: `Database migrations completed in ${duration}ms`,
  });
} catch (error) {
  logger.error({
    type: "db:migrate",
    message: "Failed to run database migrations — server will not start",
    error,
  });
  process.exit(1);
}

await pool.end();
process.exit(0);
