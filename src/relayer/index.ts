import { config } from "./config";
import { USDC_WH_SENDER } from "../common/const";
import { getLogger } from "../common/logging";
import { Logger } from "winston";
import Koa, { Context, Next } from "koa";
import Router from "koa-router";
import { CctpRelayer } from "./cctp.relayer";
import {
  StandardRelayerApp,
  StandardRelayerContext,
} from "@wormhole-foundation/relayer-engine";
import { Relay } from "../data/relay.model";
import { storeRelays } from "../data/data.middleware";
import { setupDb } from "../data/db";
import { InfluxDB, WriteApi } from "@influxdata/influxdb-client";

export interface CctpRelayerContext extends StandardRelayerContext {
  relay: Relay;
}
async function main() {
  const env = config.blockchainEnv;
  const logger = getLogger(config.env, config.logLevel);

  let influxWriteApi: WriteApi | undefined = undefined;
  if (config.influx.url) {
    logger.debug(`Pushing metrics to bucket ${config.influx.bucket}`);
    const { url, token, org, bucket } = config.influx;
    influxWriteApi = new InfluxDB({ url, token }).getWriteApi(
      org,
      bucket,
      "ns"
    );
  }

  const usdcWhSenderAddresses = USDC_WH_SENDER[env];
  const serv = new CctpRelayer(env, influxWriteApi);

  await setupDb({ uri: config.db.uri, database: config.db.database });
  const app = new StandardRelayerApp<CctpRelayerContext>(env, {
    name: "CCTPRelayer",
    fetchSourceTxhash: true,
    redis: config.redis,
    redisClusterEndpoints: config.redisClusterEndpoints,
    redisCluster: config.redisClusterOptions,
    spyEndpoint: config.spy,
    concurrency: 5,
    privateKeys: config.privateKeys,
    logger,
  });

  app.use(storeRelays(app, logger));

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

  router.get(`/metrics`, async (ctx, _) => {
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
  return async (ctx: Context, _: Next) => {
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
