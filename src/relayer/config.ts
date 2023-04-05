import { Environment } from "wormhole-relayer/lib";
import { CHAIN_ID_AVAX, CHAIN_ID_ETH } from "@certusone/wormhole-sdk";
import { ClusterOptions, RedisOptions } from "ioredis";

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

if (!process.env.ETH_PRIVATE_KEY) {
  throw new Error("ETH_PRIVATE_KEY not set");
}

if (!process.env.AVAX_PRIVATE_KEY) {
  throw new Error("AVAX_PRIVATE_KEY not set");
}

const isRedisCluster = !!process.env.REDIS_CLUSTER_ENDPOINTS;

export const config = {
  env: process.env.NODE_ENV || "local",
  blockchainEnv: getBlockchainEnv(process.env.BLOCKCHAIN_ENV ?? ""), // TODO validate and parse properly
  logLevel: process.env.LOG_LEVEL || "debug",
  privateKeys: {
    [CHAIN_ID_ETH]: [process.env.ETH_PRIVATE_KEY],
    [CHAIN_ID_AVAX]: [process.env.AVAX_PRIVATE_KEY],
  },
  spy: process.env.SPY_URL ?? "localhost:7073",
  concurrency: Number(process.env.RELAY_CONCURRENCY) || 1,
  influx: {
    url: process.env.INFLUXDB_URL,
    org: process.env.INFLUXDB_ORG,
    bucket: process.env.INFLUXDB_BUCKET,
    token: process.env.INFLUXDB_TOKEN,
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
};