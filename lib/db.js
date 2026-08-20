import pg from "pg";

const { Pool } = pg;
const globalForDb = globalThis;

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL não configurada no ambiente de execução");
}

export const pool =
  globalForDb.__commanddeskPool ||
  new Pool({
    connectionString: databaseUrl,
    ssl:
      databaseUrl.includes("localhost") || databaseUrl.includes("127.0.0.1")
        ? false
        : { rejectUnauthorized: false },
    max: 10
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__commanddeskPool = pool;
}

export async function q(text, params = []) {
  const result = await pool.query(text, params);
  return result;
}

export async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
