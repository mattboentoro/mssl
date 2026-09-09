import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/**
 * Creates a throwaway SQLite database for the database-backed tests.
 * `prisma db push --force-reset` rebuilds the schema from scratch each run.
 */
export default function setup() {
  const testDbUrl = "file:./test.db";
  const dbFile = path.join(process.cwd(), "prisma", "test.db");

  for (const suffix of ["", "-journal"]) {
    fs.rmSync(`${dbFile}${suffix}`, { force: true });
  }

  execSync("npx prisma db push --skip-generate --force-reset --accept-data-loss", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: testDbUrl },
  });
}
