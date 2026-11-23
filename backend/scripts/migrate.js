
import pg from "pg";
import dotenv from "dotenv";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

dotenv.config();

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not configured");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 2,
});

const currentFile = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFile);
const migrationsDir = path.join(currentDir, "../migrations");

const client = await pool.connect();

let lockAcquired = false;

try {
  console.log("Starting database migrations...");

  // Prevent two migration processes running together.
  await client.query(
    "SELECT pg_advisory_lock(72645123)"
  );

  lockAcquired = true;

  // Migration history table.
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const files = (await fs.readdir(migrationsDir))
    .filter((file) => /^\d+_[a-zA-Z0-9_-]+\.sql$/.test(file))
    .sort();

  const result = await client.query(
    "SELECT filename FROM public.schema_migrations"
  );

  const applied = new Set(
    result.rows.map((row) => row.filename)
  );

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`Already applied: ${file}`);
      continue;
    }

    console.log(`Applying migration: ${file}`);

    const sql = await fs.readFile(
      path.join(migrationsDir, file),
      "utf8"
    );

    await client.query("BEGIN");

    try {
      if (!sql.trim()) {
        throw new Error(`Migration is empty: ${file}`);
      }

      await client.query(sql);

      await client.query(
        `INSERT INTO public.schema_migrations (filename)
         VALUES ($1)`,
        [file]
      );

      await client.query("COMMIT");

      console.log(`Successfully applied: ${file}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }

  console.log("All database migrations completed.");

} catch (error) {
  console.error("Migration failed:", error);
  process.exitCode = 1;

} finally {
  if (lockAcquired) {
    try {
      await client.query(
        "SELECT pg_advisory_unlock(72645123)"
      );
    } catch (error) {
      console.error("Could not release migration lock:", error);
    }
  }

  client.release();
  await pool.end();
}
