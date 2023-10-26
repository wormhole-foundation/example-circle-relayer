import Koa from "koa";
import Router from "koa-router";
import cors from "@koa/cors";
import { Relay } from "../data/relay.model.js";
import { setupDb } from "../data/db.js";
import { getLogger } from "../common/logging.js";
import { RelayController } from "./relays.controller.js";
import { healthMiddleware, loggerMiddleware } from "./middleware.js";

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
  logger.info("connecting to db...");
  await setupDb(config.db);
  logger.info("connected to db.");
  const relayCtrl = new RelayController(Relay);

  const router = new Router();
  router.prefix("/v1");
  // Admin endpoints
  router.get("/health", healthMiddleware);

  // Relay endpoints
  router.get("/relays", relayCtrl.search);

  app.use(cors({ origin: "*" }));
  app.use(loggerMiddleware(logger));
  app.use(router.allowedMethods());
  app.use(router.middleware());

  app.listen(config.port, () => {
    logger.info(`Listening on port ${config.port}`);
  });
}

main();
