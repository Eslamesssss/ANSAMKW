import pg from "pg";
import { migrate } from "./migrate";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}
const pool = new pg.Pool({ connectionString: url });
try {
  const applied = await migrate(pool);
  console.log(applied.length ? `Applied: ${applied.join(", ")}` : "Database is up to date");
} catch (err) {
  console.error((err as Error).message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
