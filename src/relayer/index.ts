import { config } from "./config";
import { USDC_WH_SENDER } from "../common/supported-chains.config";
import { getLogger } from "../common/logging";
import { CctpRelayer } from "./cctp.relayer";
import {
  StandardRelayerApp,
  StandardRelayerContext,
} from "@wormhole-foundation/relayer-engine";
import { DataContext, storeRelays } from "../data/data.middleware";
import { setupDb } from "../data/db";
import { InfluxDB, WriteApi } from "@influxdata/influxdb-client";
import { logging } from "@xlabs/relayer-engine-middleware/lib/logging.middleware";
import { assetPrices } from "@xlabs/relayer-engine-middleware/lib/asset-pricing.middleware";
import {
  explorerLinks,
  ExplorerLinksContext,
} from "@xlabs/relayer-engine-middleware/lib/explorer-links.middleware";
import { runAPI } from "@xlabs/relayer-engine-middleware/lib/relayer-api";

import {
  evmOverrides,
  EvmOverridesContext,
} from "@xlabs/relayer-engine-middleware/lib/override.middleware";
import { cctp, CctpContext } from "@xlabs/cctp-middleware/lib";

export type CctpRelayerContext = StandardRelayerContext &
  ExplorerLinksContext &
  EvmOverridesContext &
  CctpContext &
  DataContext;
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
    name: config.name,
    fetchSourceTxhash: true,
    redis: config.redis,
    redisClusterEndpoints: config.redisClusterEndpoints,
    redisCluster: config.redisClusterOptions,
    spyEndpoint: config.spy,
    concurrency: 5,
    privateKeys: config.privateKeys,
    logger,
  });

  // Custom xlabs middleware: https://github.com/XLabs/relayer-engine-middleware
  app.use(logging(logger));
  app.use(assetPrices());
  app.use(explorerLinks());
  app.use(evmOverrides());
  // End custom xlabs middleware
  app.use(cctp());

  app.use(storeRelays(app, logger));

  app.filter(serv.preFilter);

  app.multiple(usdcWhSenderAddresses, serv.handleVaa);

  app.listen();

  runAPI(app, config.api.port, logger);
}

main();
