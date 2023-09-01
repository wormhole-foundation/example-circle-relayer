import {
  CHAIN_ID_AVAX,
  CHAIN_ID_ETH,
  CHAIN_ID_ARBITRUM,
  CHAIN_ID_OPTIMISM,
} from "@certusone/wormhole-sdk";
import { ethers, Wallet } from "ethers";
import { rpcsByEnv } from "./rpcs";
import { relayerContract } from "../common/contracts";
import { Environment } from "@wormhole-foundation/relayer-engine";
import {
  USDC_ERC20_ADDRESSES_BY_ENV,
  USDC_RELAYER_ADDRESSES,
} from "../common/supported-chains.config";

const blockchainEnv = getBlockchainEnv(process.env.BLOCKCHAIN_ENV);

const strip0x = (str: string) =>
  str.startsWith("0x") ? str.substring(2) : str;

const ethKey = process.env.ETH_OWNER_PRIVATE_KEY;
const avaxKey = process.env.AVAX_OWNER_PRIVATE_KEY;
const arbKey = process.env.ARBITRUM_OWNER_PRIVATE_KEY;
const optKey = process.env.OPTIMISM_OWNER_PRIVATE_KEY;
if (!ethKey) {
  console.error("ETH_OWNER_PRIVATE_KEY is required!");
  process.exit(1);
}
if (!avaxKey) {
  console.error("AVAX_OWNER_PRIVATE_KEY is required!");
  process.exit(1);
}
if (!arbKey) {
  console.error("ARBITRUM_OWNER_PRIVATE_KEY is required!");
  process.exit(1);
}
if (!optKey) {
  console.error("OPTIMISM_OWNER_PRIVATE_KEY is required!");
  process.exit(1);
}

// supported chains
const SUPPORTED_CHAINS = [
  CHAIN_ID_ETH,
  CHAIN_ID_AVAX,
  CHAIN_ID_ARBITRUM,
  CHAIN_ID_OPTIMISM,
];
type SupportedChainId = typeof SUPPORTED_CHAINS[number];

const rpcs: { [k in SupportedChainId]?: ethers.providers.Provider } =
  rpcsByEnv[blockchainEnv];
// wallets
const SIGNERS = {
  [CHAIN_ID_ETH]: new ethers.Wallet(
    new Uint8Array(Buffer.from(strip0x(ethKey), "hex")),
    rpcs[CHAIN_ID_ETH]
  ),
  [CHAIN_ID_AVAX]: new ethers.Wallet(
    new Uint8Array(Buffer.from(strip0x(avaxKey), "hex")),
    rpcs[CHAIN_ID_AVAX]
  ),
  [CHAIN_ID_ARBITRUM]: new ethers.Wallet(
    new Uint8Array(Buffer.from(strip0x(arbKey), "hex")),
    rpcs[CHAIN_ID_ARBITRUM]
  ),
  [CHAIN_ID_OPTIMISM]: new ethers.Wallet(
    new Uint8Array(Buffer.from(strip0x(optKey), "hex")),
    rpcs[CHAIN_ID_ARBITRUM]
  ),
};

// receives an object with chainIds and a Wallet object and returns an object with ChainId to RelayerContract objects
const signersToRelayerContracts = (signers: { [s: string]: Wallet }) =>
  Object.fromEntries(
    Object.entries(signers).map(([chainId, pk]) => [
      chainId,
      // @ts-ignore
      relayerContract(USDC_RELAYER_ADDRESSES[blockchainEnv][chainId], pk),
    ])
  );

export const config = {
  env: process.env.NODE_ENV || "local",
  logLevel: process.env.LOG_LEVEL || "debug",
  blockchainEnv,
  fetchPricesIntervalMs:
    Number(process.env.FETCH_PRICE_INTERVAL_IN_MS) || 60000, // how often to poll for pricing changes.
  minPriceChangePercentage: Number(process.env.UPDATE_PRICE_CHANGE_PCT) || 2, // what's the minimum amount the price must change for us to update it.
  maxPriceChangePercentage:
    Number(process.env.UPDATE_PRICE_CHANGE_PCT_CAP) || 25, // if the price changed too much, avoid updating.
  pricePrecision: 8, // decimal places for price precision.
  relayers: [],
  relayerContracts: signersToRelayerContracts(SIGNERS),
  relayerContractAddresses: USDC_RELAYER_ADDRESSES,
  usdcAddresses: USDC_ERC20_ADDRESSES_BY_ENV[blockchainEnv],
  signers: SIGNERS,
  api: {
    port: Number(process.env.ORACLE_API_PORT) || 3500,
  },
};

export function getBlockchainEnv(env?: string): Environment {
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
