// Circle Bridge contracts
import {
  CHAIN_ID_AVAX,
  CHAIN_ID_ETH,
  CHAIN_ID_ARBITRUM,
} from "@certusone/wormhole-sdk";
import { Environment } from "@wormhole-foundation/relayer-engine";

export const USDC_DECIMALS = 6;

export const SUPPORTED_CHAINS = [
  CHAIN_ID_ETH,
  CHAIN_ID_AVAX,
  CHAIN_ID_ARBITRUM,
];
export type SupportedChainId = typeof SUPPORTED_CHAINS[number];

export type Addresses = Partial<{ [k in SupportedChainId]: string }>;
export type AddressesByEnvAndChain = {
  [e: string]: Addresses;
};

export const USDC_ERC20_ADDRESSES_BY_ENV = {
  [Environment.MAINNET]: {
    [CHAIN_ID_ETH]: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    [CHAIN_ID_AVAX]: "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e",
    [CHAIN_ID_ARBITRUM]: "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
  },
  [Environment.TESTNET]: {
    [CHAIN_ID_ETH]: "0x07865c6E87B9F70255377e024ace6630C1Eaa37F",
    [CHAIN_ID_AVAX]: "0x5425890298aed601595a70AB815c96711a31Bc65",
    [CHAIN_ID_ARBITRUM]: "0xfd064A18f3BF249cf1f87FC203E90D8f650f2d63",
  },
  [Environment.DEVNET]: {
    [CHAIN_ID_ETH]: "",
    [CHAIN_ID_AVAX]: "",
    [CHAIN_ID_ARBITRUM]: "",
  },
};

export const CIRCLE_CONTRACT_ADDRESSES: AddressesByEnvAndChain = {
  [Environment.TESTNET]: {
    [CHAIN_ID_ETH]: "0x26413e8157cd32011e726065a5462e97dd4d03d9",
    [CHAIN_ID_AVAX]: "0xa9fb1b3009dcb79e2fe346c16a604b8fa8ae0a79",
    [CHAIN_ID_ARBITRUM]: "0x109bc137cb64eab7c0b1dddd1edf341467dc2d35",
  },
  [Environment.MAINNET]: {
    [CHAIN_ID_ETH]: "0x0a992d191DEeC32aFe36203Ad87D7d289a738F81",
    [CHAIN_ID_AVAX]: "0x8186359af5f57fbb40c6b14a588d2a59c0c29880",
    [CHAIN_ID_ARBITRUM]: "0xC30362313FBBA5cf9163F0bb16a0e01f01A896ca",
  },
  [Environment.DEVNET]: {},
};

// USDC relayer contracts. We push the tx to these guys.
export const USDC_RELAYER_ADDRESSES: AddressesByEnvAndChain = {
  [Environment.TESTNET]: {
    [CHAIN_ID_ETH]: "0x17da1ff5386d044c63f00747b5b8ad1e3806448d",
    [CHAIN_ID_AVAX]: "0x774a70bbd03327c21460b60f25b677d9e46ab458",
    [CHAIN_ID_ARBITRUM]: "0xbf683d541e11320418ca78ec13309938e6c5922f",
  },
  [Environment.MAINNET]: {
    [CHAIN_ID_ETH]: "0x32dec3f4a0723ce02232f87e8772024e0c86d834",
    [CHAIN_ID_AVAX]: "0x32dec3f4a0723ce02232f87e8772024e0c86d834",
    [CHAIN_ID_ARBITRUM]: "0xBf683D541E11320418cA78EC13309938E6C5922f",
  },
  [Environment.DEVNET]: {
    [CHAIN_ID_ETH]: "",
    [CHAIN_ID_AVAX]: "",
    [CHAIN_ID_ARBITRUM]: "",
  },
};

// Wormhole circle integration contracts. We subscribe to the VAAs from these guys.
export const USDC_WH_SENDER: AddressesByEnvAndChain = {
  [Environment.TESTNET]: {
    [CHAIN_ID_ETH]: "0x0a69146716b3a21622287efa1607424c663069a4",
    [CHAIN_ID_AVAX]: "0x58f4c17449c90665891c42e14d34aae7a26a472e",
    [CHAIN_ID_ARBITRUM]: "0x2e8f5e00a9c5d450a72700546b89e2b70dfb00f2",
  },
  [Environment.MAINNET]: {
    [CHAIN_ID_ETH]: "0xaada05bd399372f0b0463744c09113c137636f6a",
    [CHAIN_ID_AVAX]: "0x09fb06a271faff70a651047395aaeb6265265f13",
    [CHAIN_ID_ARBITRUM]: "0x2703483B1a5a7c577e8680de9Df8Be03c6f30e3c",
  },
  [Environment.DEVNET]: {
    [CHAIN_ID_ETH]: "",
    [CHAIN_ID_AVAX]: "",
    [CHAIN_ID_ARBITRUM]: "",
  },
};

export const CIRCLE_DOMAIN_TO_WORMHOLE_CHAIN: {
  [key in number]: SupportedChainId;
} = {
  0: CHAIN_ID_ETH,
  1: CHAIN_ID_AVAX,
  3: CHAIN_ID_ARBITRUM,
};

export const circleAttestationUrl = {
  [Environment.TESTNET]: "https://iris-api-sandbox.circle.com/attestations",
  [Environment.MAINNET]: "https://iris-api.circle.com/attestations",
  [Environment.DEVNET]: "",
};
