import pino from "pino";
import { bootstrap } from "./bootstrap";
import { loadConfig, loadDotEnv } from "./config";

loadDotEnv();
const config = loadConfig();
const logger = pino({ level: config.LOG_LEVEL });

const { app, engine, repo } = await bootstrap({ config, logger, httpLogger: { level: config.LOG_LEVEL } });
await app.listen({ host: config.HOST, port: config.PORT });
logger.info({ port: config.PORT, mode: config.DATA_MODE, database: repo.kind }, "GOLD INTELLIGENCE TERMINAL server listening");

const shutdown = async (signal: string) => {
  logger.info({ signal }, "shutting down");
  engine?.stop();
  await app.close();
  await repo.close();
  process.exit(0);
};
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
