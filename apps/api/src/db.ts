import pg from "pg";
import { env } from "./env.js";

export const pool = new pg.Pool({
  connectionString: env.databaseUrl || undefined,
  max: 8,
});

export async function sql<T extends pg.QueryResultRow = pg.QueryResultRow>(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<T[]> {
  const text = strings.reduce((acc, part, i) => acc + part + (i < values.length ? `$${i + 1}` : ""), "");
  const res = await pool.query<T>(text, values);
  return res.rows;
}

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, values: unknown[] = []) {
  const res = await pool.query<T>(text, values);
  return res.rows;
}
