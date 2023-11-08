import {
  CHAIN_ID_ARBITRUM,
  CHAIN_ID_AVAX,
  CHAIN_ID_BASE,
  CHAIN_ID_ETH,
  CHAIN_ID_OPTIMISM,
  ChainId,
} from "@certusone/wormhole-sdk";
import { ClusterOptions, RedisOptions } from "ioredis";
import { Environment, ProvidersOpts } from "@wormhole-foundation/relayer-engine";
import { SupportedChainId } from "../common/supported-chains.config.js";
import { loadWalletConfigPerChain } from "@xlabs/relayer-engine-middleware";

export function getBlockchainEnv(env: string): Environment {
  if (!env) {
    return Environment.TESTNET;
  }
  switch (env.toLowerCase()) {
    case Environment.MAINNET:
      return Environment.MAINNET;
    case Environment.DEVNET:
      return Environment.DEVNET;
    default:
      return Environment.TESTNET;
  }
}

export interface MetricsMiddlewareConfig {
  processingDurationBuckets?: number[],
  totalDurationBuckets?: number[],
  relayDurationBuckets?: number[],
}

if (!process.env.EVM_PRIVATE_KEY) {
  if (!process.env.AVAX_PRIVATE_KEY) {
    throw new Error("AVAX_PRIVATE_KEY not set");
  }
  if (!process.env.ARBITRUM_PRIVATE_KEY) {
    throw new Error("ARBITRUM_PRIVATE_KEY not set");
  }
  if (!process.env.ETH_PRIVATE_KEY) {
    throw new Error("ETH_PRIVATE_KEY not set");
  }
}
const evmPrivateKeys = process.env.EVM_PRIVATE_KEY?.split(",") ?? [];

const isRedisCluster = !!process.env.REDIS_CLUSTER_ENDPOINTS;

export async function loadAppConfig () {
  const privateKeysPerChain = getWalletPrivateKeysPerChain();
  const supportedChainIds = getSupportedChainIds(privateKeysPerChain);
  const blockchainEnv = getBlockchainEnv(process.env.BLOCKCHAIN_ENV ?? "");

  const walletConfigPerChain = await loadWalletConfigPerChain(
    process.env.WALLET_MONITORING_CONFIG_PATH ?? "",
    supportedChainIds,
    blockchainEnv,
    privateKeysPerChain
  );
  const providers = JSON.parse(process.env.BLOCKCHAIN_PROVIDERS ?? `{"chains":{}}`);

  return {
    env: process.env.NODE_ENV || "local",
    name: process.env.RELAYER_NAME || "CCTPRelayer",
    blockchainEnv, // TODO validate and parse properly
    logLevel: process.env.LOG_LEVEL || "debug",
    spy: process.env.SPY_URL ?? "localhost:7073",
    concurrency: Number(process.env.RELAY_CONCURRENCY) || 1,
    influx: {
      url: process.env.INFLUXDB_URL || "",
      org: process.env.INFLUXDB_ORG || "xlabs",
      bucket: process.env.INFLUXDB_BUCKET || "",
      token: process.env.INFLUXDB_TOKEN || "",
    },
    redisClusterEndpoints: process.env.REDIS_CLUSTER_ENDPOINTS?.split(","), // "url1:port,url2:port"
    redisClusterOptions: isRedisCluster
      ? <ClusterOptions>{
        dnsLookup: (address: any, callback: any) => callback(null, address),
        slotsRefreshTimeout: 1000,
        redisOptions: {
          tls: process.env.REDIS_TLS ? {} : undefined,
          username: process.env.REDIS_USERNAME,
          password: process.env.REDIS_PASSWORD,
        },
      }
      : undefined,
    redis: <RedisOptions>{
      tls: process.env.REDIS_TLS ? {} : undefined,
      host: process.env.REDIS_HOST ? undefined : process.env.REDIS_HOST,
      port: process.env.REDIS_CLUSTER_ENDPOINTS
        ? undefined
        : Number(process.env.REDIS_PORT) || undefined,
      username: process.env.REDIS_USERNAME,
      password: process.env.REDIS_PASSWORD,
    },
    api: {
      port: Number(process.env.API_PORT) ?? 3000,
    },
    db: {
      uri: process.env.MONGO_URI ?? "mongodb://localhost:27017",
      database: process.env.MONGO_DATABASE ?? "cctp-relayer",
    },
    metrics: {
      processingDurationBuckets: parseNumberArray(process.env.METRICS_PROCESSING_DURATION_BUCKETS),
      totalDurationBuckets: parseNumberArray(process.env.METRICS_TOTAL_DURATION_BUCKETS),
      relayDurationBuckets: parseNumberArray(process.env.METRICS_RELAY_DURATION_BUCKETS),
    },
    wormholeRpcs: process.env.WORMHOLE_RPCS
      ? JSON.parse(process.env.WORMHOLE_RPCS)
      : undefined, // default to Relayer Engine defaults if we don't set specific RPCs
    missedVaas: {
      enabled: process.env.MISSED_VAAS_ENABLED === "true",
      startingSequenceConfig: process.env.MISSED_VAAS_STARTING_SEQUENCE_CONFIG
        ? parseStartingSequence(
          process.env.MISSED_VAAS_STARTING_SEQUENCE_CONFIG
        )
        : undefined,
      forceSeenKeysReindex:
        process.env.MISSED_VAAS_FORCE_SEEN_KEYS_REINDEX === "true",
    },
    providers: processBlockChainProviders(
      providers,
      supportedChainIds
    ),
    supportedChainIds: supportedChainIds.map(String),
    walletConfigPerChain,
    walletAcquireTimeout: Number(process.env.WALLET_ACQUIRE_TIMEOUT) || 30_000
  };
}

export function getWalletPrivateKeysPerChain (): Record<SupportedChainId, string[]> {
  return {
    [CHAIN_ID_ETH]: process.env.ETH_PRIVATE_KEY?.split(",") ?? evmPrivateKeys,
    [CHAIN_ID_AVAX]: process.env.AVAX_PRIVATE_KEY?.split(",") ?? evmPrivateKeys,
    [CHAIN_ID_ARBITRUM]:
      process.env.ARBITRUM_PRIVATE_KEY?.split(",") ?? evmPrivateKeys,
    [CHAIN_ID_OPTIMISM]:
      process.env.OPTIMISM_PRIVATE_KEY?.split(",") ?? evmPrivateKeys,
    [CHAIN_ID_BASE]:
      process.env.BASE_PRIVATE_KEY?.split(",") ?? evmPrivateKeys,
  };
}

/**
 * This function is used to build the providers object to the format that
 * the relayer-engine expects.
 *
 * Caveat: Currently, relayer-engine only uses the first provider in the list.
 * @param providers RPC providers
 * @param supportedChainIds supported chains extracted from wormhole relayers contract
 * @returns ProvidersOpts
 */
function processBlockChainProviders(
  providers: ProvidersOpts,
  supportedChainIds: ChainId[]
): ProvidersOpts {
  const supportedBlockchainProviders: ProvidersOpts = {
    chains: {},
  };

  for (const chainId of supportedChainIds) {
    if (providers.chains[chainId]) {
      supportedBlockchainProviders.chains[chainId] = {
        endpoints: providers.chains[chainId]?.endpoints.map((url) => url) || [],
      };
    } else {
      // no op, use default provider from relayer-engine provider middleware
    }
  }
  return supportedBlockchainProviders;
}

function getSupportedChainIds(walletPrivateKeysPerChain: Record<SupportedChainId, string[]>): SupportedChainId[] {
  return Object.keys(walletPrivateKeysPerChain).map(Number) as SupportedChainId[];
}

function parseStartingSequence(raw: string): Record<string, bigint> {
  const obj = JSON.parse(raw) as Record<string, number>;

  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [k, BigInt(v as number)])
  );
}

function parseNumberArray(raw?: string): number[] | undefined {
  return raw?.split(",").map(value => Number(value));
}
