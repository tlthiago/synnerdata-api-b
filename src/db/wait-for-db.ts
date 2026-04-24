import { Pool } from "pg";
import { env } from "@/env";
import { logger } from "../lib/logger";

const MAX_ATTEMPTS = 30;
const DELAY_MS = 1000;
const CONNECTION_TIMEOUT_MS = 2000;

const pool = new Pool({
  connectionString: env.DATABASE_URL,
  connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
});

for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
  try {
    await pool.query("SELECT 1");
    logger.info({
      type: "db:wait-for-db",
      message: `Database ready (attempt ${attempt}/${MAX_ATTEMPTS})`,
    });
    await pool.end();
    process.exit(0);
  } catch (error) {
    if (attempt === MAX_ATTEMPTS) {
      logger.error({
        type: "db:wait-for-db",
        message: `Database unreachable after ${MAX_ATTEMPTS} attempts — server will not start`,
        error,
      });
      await pool.end();
      process.exit(1);
    }
    logger.info({
      type: "db:wait-for-db",
      message: `Waiting for database (attempt ${attempt}/${MAX_ATTEMPTS})`,
    });
    await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
  }
}
