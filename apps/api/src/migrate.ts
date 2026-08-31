import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "./db.js";

const here = dirname(fileURLToPath(import.meta.url));

export async function migrate() {
  const sqlFile = join(here, "../sql/001_init.sql");
  const body = readFileSync(sqlFile, "utf8");
  await pool.query(body);
}
