import { Pool, PoolClient, types } from "pg";
import { config } from "../config";

// Return NUMERIC as JS numbers (all amounts here are < $1M with 2dp, so this is safe).
types.setTypeParser(1700, (v) => parseFloat(v));

export const pool = new Pool({ connectionString: config.DATABASE_URL, max: 10 });

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function waitForDatabase(retries = 30, delayMs = 1000): Promise<void> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await pool.query("SELECT 1");
      return;
    } catch (err) {
      if (attempt === retries) throw err;
      console.log(`[db] waiting for database (${attempt}/${retries})...`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}
