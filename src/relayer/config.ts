import {
  CHAIN_ID_ARBITRUM,
  CHAIN_ID_AVAX,
  CHAIN_ID_ETH,
  CHAIN_ID_OPTIMISM,
} from "@certusone/wormhole-sdk";
import { ClusterOptions, RedisOptions } from "ioredis";
import { Environment } from "@wormhole-foundation/relayer-engine";
import { rpcsByEnv } from "./rpcs";

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

const defaultRpcs = {
  chains: rpcsByEnv[getBlockchainEnv(process.env.BLOCKCHAIN_ENV ?? "")]
}

export const config = {
  env: process.env.NODE_ENV || "local",
  name: process.env.RELAYER_NAME || "CCTPRelayer",
  blockchainEnv: getBlockchainEnv(process.env.BLOCKCHAIN_ENV ?? ""), // TODO validate and parse properly
  logLevel: process.env.LOG_LEVEL || "debug",
  privateKeys: {
    [CHAIN_ID_ETH]: process.env.ETH_PRIVATE_KEY?.split(",") ?? evmPrivateKeys,
    [CHAIN_ID_AVAX]: process.env.AVAX_PRIVATE_KEY?.split(",") ?? evmPrivateKeys,
    [CHAIN_ID_ARBITRUM]:
      process.env.ARBITRUM_PRIVATE_KEY?.split(",") ?? evmPrivateKeys,
    [CHAIN_ID_OPTIMISM]:
      process.env.OPTIMISM_PRIVATE_KEY?.split(",") ?? evmPrivateKeys,
  },
  providers: process.env.BLOCKCHAIN_PROVIDERS
      ? JSON.parse(process.env.BLOCKCHAIN_PROVIDERS)
      : defaultRpcs,
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
  }
};

function parseNumberArray(raw?: string): number[] | undefined {
  return raw?.split(",").map(value => Number(value));
}
