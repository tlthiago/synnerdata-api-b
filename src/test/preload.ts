import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set");
}

const url = new URL(databaseUrl);
const dbName = url.pathname.slice(1);

// Connect to the default "postgres" database to create test DB if needed
const adminUrl = new URL(databaseUrl);
adminUrl.pathname = "/postgres";

const adminPool = new Pool({ connectionString: adminUrl.toString() });

const { rowCount } = await adminPool.query(
  "SELECT 1 FROM pg_database WHERE datname = $1",
  [dbName]
);

if (rowCount === 0) {
  await adminPool.query(`CREATE DATABASE "${dbName}"`);
  console.log(`[test:preload] Created database "${dbName}"`);
}

await adminPool.end();

// Run Drizzle migrations on the test database
const pool = new Pool({ connectionString: databaseUrl });
const db = drizzle(pool);

await migrate(db, { migrationsFolder: "./src/db/migrations" });

await pool.end();
