// Circle Bridge contracts
import { CHAIN_ID_AVAX, CHAIN_ID_ETH } from "@certusone/wormhole-sdk";
import { Environment } from "@wormhole-foundation/relayer-engine";

export const USDC_DECIMALS = 6;

export const SUPPORTED_CHAINS = [CHAIN_ID_ETH, CHAIN_ID_AVAX];
export type SupportedChainId = typeof SUPPORTED_CHAINS[number];

export type Addresses = Partial<{ [k in SupportedChainId]: string }>;
export type AddressesByEnvAndChain = {
  [e: string]: Addresses;
};

export const USDC_ERC20_ADDRESSES_BY_ENV = {
  [Environment.MAINNET]: {
    [CHAIN_ID_ETH]: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    [CHAIN_ID_AVAX]: "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e",
  },
  [Environment.TESTNET]: {
    [CHAIN_ID_ETH]: "0x07865c6E87B9F70255377e024ace6630C1Eaa37F",
    [CHAIN_ID_AVAX]: "0x5425890298aed601595a70AB815c96711a31Bc65",
  },
  [Environment.DEVNET]: {
    [CHAIN_ID_ETH]: "",
    [CHAIN_ID_AVAX]: "",
  },
};

export const CIRCLE_CONTRACT_ADDRESSES: AddressesByEnvAndChain = {
  [Environment.TESTNET]: {
    [CHAIN_ID_ETH]: "0x26413e8157cd32011e726065a5462e97dd4d03d9",
    [CHAIN_ID_AVAX]: "0xa9fb1b3009dcb79e2fe346c16a604b8fa8ae0a79",
  },
  [Environment.MAINNET]: {
    [CHAIN_ID_ETH]: "0x0a992d191DEeC32aFe36203Ad87D7d289a738F81",
    [CHAIN_ID_AVAX]: "0x8186359af5f57fbb40c6b14a588d2a59c0c29880",
  },
  [Environment.DEVNET]: {},
};

// USDC relayer contracts. We push the tx to these guys.
export const USDC_RELAYER_ADDRESSES: AddressesByEnvAndChain = {
  [Environment.TESTNET]: {
    [CHAIN_ID_ETH]: "0xb9f955b03cea9315247e77a09b6e2f1c587e017f",
    [CHAIN_ID_AVAX]: "0xb9f955b03cea9315247e77a09b6e2f1c587e017f",
  },
  [Environment.MAINNET]: {
    [CHAIN_ID_ETH]: "0x32dec3f4a0723ce02232f87e8772024e0c86d834",
    [CHAIN_ID_AVAX]: "0x32dec3f4a0723ce02232f87e8772024e0c86d834",
  },
  [Environment.DEVNET]: {
    [CHAIN_ID_ETH]: "",
    [CHAIN_ID_AVAX]: "",
  },
};

// Wormhole circle integration contracts. We subscribe to the VAAs from these guys.
export const USDC_WH_SENDER: AddressesByEnvAndChain = {
  [Environment.TESTNET]: {
    [CHAIN_ID_ETH]: "0x0a69146716b3a21622287efa1607424c663069a4",
    [CHAIN_ID_AVAX]: "0x58f4c17449c90665891c42e14d34aae7a26a472e",
  },
  [Environment.MAINNET]: {
    [CHAIN_ID_ETH]: "0xaada05bd399372f0b0463744c09113c137636f6a",
    [CHAIN_ID_AVAX]: "0x09fb06a271faff70a651047395aaeb6265265f13",
  },
  [Environment.DEVNET]: {
    [CHAIN_ID_ETH]: "",
    [CHAIN_ID_AVAX]: "",
  },
};

export const CIRCLE_DOMAIN_TO_WORMHOLE_CHAIN: {
  [key in number]: SupportedChainId;
} = {
  0: CHAIN_ID_ETH,
  1: CHAIN_ID_AVAX,
};

export const circleAttestationUrl = {
  [Environment.TESTNET]: "https://iris-api-sandbox.circle.com/attestations",
  [Environment.MAINNET]: "https://iris-api.circle.com/attestations",
  [Environment.DEVNET]: "",
};
