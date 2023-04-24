import Koa from "koa";
import Router from "koa-router";
import { Relay } from "../data/relay.model";
import { setupDb } from "../data/db";
import { getLogger } from "../common/logging";
import { RelayController } from "./relays.controller";

const config = {
  env: process.env.NODE_ENV || "local",
  blockchainEnv: process.env.BLOCKCHAIN_ENV || "testnet",
  port: Number(process.env.PORT) || 8080,
  logLevel: process.env.LOG_LEVEL || "info",
  db: {
    uri: process.env.MONGO_URI || "mongodb://localhost:27017",
    database: process.env.MONGO_NAME || "relays",
  },
};

async function main() {
  const logger = getLogger(config.env, config.logLevel);
  const app = new Koa();
  await setupDb(config.db);
  const relayCtrl = new RelayController(Relay);

  const router = new Router();
  router.prefix("/v1");

  router.get("/relays", relayCtrl.search);

  router.get("/health", async (ctx) => {
    ctx.body = "ok";
  });

  app.use(async (ctx, next) => {
    logger.debug(`${ctx.method} ${ctx.url}`);
    const start = process.hrtime();
    await next();
    const [_, inNanos] = process.hrtime(start);
    const duration = inNanos / 1e6;
    logger.debug(`${ctx.method} ${ctx.url} ${ctx.status} ${duration}ms`, {
      method: ctx.method,
      url: ctx.url,
      duration,
      status: ctx.status,
    });
  });
  app.use(router.allowedMethods());
  app.use(router.middleware());

  app.listen(config.port, () => {
    logger.info(`Listening on port ${config.port}`);
  });
}

main();
