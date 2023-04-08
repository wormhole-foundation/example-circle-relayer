import { StandardRelayerApp } from "wormhole-relayer";
import { config } from "./config";
import { USDC_WH_SENDER } from "../common/const";
import { getLogger } from "../common/logging";
import { Logger } from "winston";
import Koa, { Context, Next } from "koa";
import * as Router from "koa-router";
import { RelayerService } from "./relayer.service";

async function main() {
  const env = config.blockchainEnv;

  const usdcWhSenderAddresses = USDC_WH_SENDER[env];
  const serv = new RelayerService(env);

  const logger = getLogger(config.env, config.logLevel);
  const app = new StandardRelayerApp(env, {
    name: "CCTPRelayer",
    fetchSourceTxhash: true,
    redis: config.redis,
    redisClusterEndpoints: config.redisClusterEndpoints,
    redisCluster: config.redisClusterOptions,
    spyEndpoint: config.spy,
    concurrency: 3,
    privateKeys: config.privateKeys,
    logger,
  });

  app.multiple(usdcWhSenderAddresses, serv.handleVaa);

  app.listen();

  runAPI(app, config.api.port, logger);
}

function runAPI(
  relayer: StandardRelayerApp<any>,
  port: number,
  rootLogger: Logger
) {
  const app = new Koa();
  const router = new Router();

  router.get(`/metrics`, async (ctx, next) => {
    ctx.body = await relayer.metricsRegistry?.metrics();
  });

  router.post(
    `/vaas/:emitterChain/:emitterAddress/:sequence`,
    reprocessVaaById(rootLogger, relayer)
  );

  app.use(relayer.storageKoaUI("/ui"));

  app.use(router.routes());
  app.use(router.allowedMethods());

  port = Number(port) || 3000;
  app.listen(port, () => {
    rootLogger.info(`Running on ${port}...`);
    rootLogger.info(`For the UI, open http://localhost:${port}/ui`);
    rootLogger.info("Make sure Redis is running on port 6379 by default");
  });
}

function reprocessVaaById(rootLogger: Logger, relayer: StandardRelayerApp) {
  return async (ctx: Context, next: Next) => {
    const { emitterChain, emitterAddress, sequence } = ctx.params;
    const logger = rootLogger.child({
      emitterChain,
      emitterAddress,
      sequence,
    });
    logger.info("fetching vaa requested by API");
    let vaa = await relayer.fetchVaa(emitterChain, emitterAddress, sequence);
    if (!vaa) {
      logger.error("fetching vaa requested by API");
      return;
    }
    relayer.processVaa(Buffer.from(vaa.bytes));
    ctx.body = "Processing";
  };
}

main();
