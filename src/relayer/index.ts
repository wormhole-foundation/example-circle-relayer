import { loadAppConfig } from "./config.js";
import { USDC_WH_SENDER } from "../common/supported-chains.config.js";
import { getLogger } from "../common/logging.js";
import { CctpRelayer } from "./cctp.relayer.js";
import {
  LoggingContext,
  RedisStorage,
  SourceTxContext,
  StagingAreaContext,
  RelayerApp,
  StorageContext,
  TokenBridgeContext,
  StandardRelayerAppOpts
} from "@wormhole-foundation/relayer-engine";
import { DataContext, storeRelays } from "../data/data.middleware.js";
import { setupDb } from "../data/db.js";
import { InfluxDB, WriteApi } from "@influxdata/influxdb-client";
import { Registry } from "prom-client";
import { metricsMiddleware } from "./metrics.js";

import { cctp, CctpContext } from "@xlabs/cctp-middleware";
import {
  assetPrices,
  logging,
  evmOverrides,
  EvmOverridesContext,
  explorerLinks,
  ExplorerLinksContext,
  PricingContext,
  runAPI,
} from "@xlabs/relayer-engine-middleware";
import { WalletContext, wallets } from "@xlabs/relayer-engine-middleware";

export type CctpRelayerContext = LoggingContext &
  StorageContext &
  TokenBridgeContext &
  StagingAreaContext &
  SourceTxContext &
  PricingContext &
  ExplorerLinksContext &
  EvmOverridesContext &
  CctpContext &
  DataContext &
  WalletContext;

// based on the attempts, returns an exponential backoff in ms
const second = 1_000;
const minute = 60 * second;
async function main() {
  const config = await loadAppConfig();
  const env = config.blockchainEnv;
  const logger = getLogger(config.env, config.logLevel);

  let influxWriteApi: WriteApi | undefined = undefined;
  if (config.influx.url) {
    logger.debug(`Pushing metrics to bucket ${config.influx.bucket}`);
    const { url, token, org, bucket } = config.influx;
    influxWriteApi = new InfluxDB({ url, token }).getWriteApi(org, bucket, "ns");
  }

  const usdcWhSenderAddresses = USDC_WH_SENDER[env];
  const serv = new CctpRelayer(env, influxWriteApi);

  const opts: StandardRelayerAppOpts = {
    name: config.name,
    fetchSourceTxhash: true,
    redis: config.redis,
    wormholeRpcs: config.wormholeRpcs,
    redisClusterEndpoints: config.redisClusterEndpoints,
    redisCluster: config.redisClusterOptions,
    spyEndpoint: config.spy,
    concurrency: 5,
    providers: config.providers,
    logger,
    workflows: {
      retries: 10,
    },
    retryBackoffOptions: {
      maxDelayMs: 10 * minute,
      baseDelayMs: 2_000,
    },
    missedVaaOptions: config.missedVaas,
  }

  await setupDb({ uri: config.db.uri, database: config.db.database });
  const app = new RelayerApp<CctpRelayerContext>(env, opts);

  const metricsMiddlewareRegistry = new Registry();
  app.use(metricsMiddleware(metricsMiddlewareRegistry, config.metrics));

  // Custom xlabs middleware: https://github.com/XLabs/relayer-engine-middleware
  app.use(logging(logger));
  app.use(assetPrices());
  app.use(explorerLinks());
  app.use(evmOverrides());
  app.use(
    wallets({
      env: config.blockchainEnv,
      walletConfigPerChain: config.walletConfigPerChain,
      walletOptions: {
        logger,
        namespace: config.name,
        metrics: { enabled: true, registry: metricsMiddlewareRegistry },
        acquireTimeout: config.walletAcquireTimeout,
      },
    })
  );
  // End custom xlabs middleware
  app.use(cctp());

  app.use(storeRelays(app, logger));

  app.filter(serv.preFilter);

  app.multiple(usdcWhSenderAddresses, serv.handleVaa);

  app.listen();

  runAPI(app, config.api.port, logger, app.storage as RedisStorage, [metricsMiddlewareRegistry]);
}

main().catch((e) => {
  console.error("Encountered unrecoverable error:");
  console.error(e);
  process.exit(1);
});
