// Circle Bridge contracts
import { CHAIN_ID_AVAX, CHAIN_ID_ETH } from "@certusone/wormhole-sdk";
import { Environment } from "wormhole-relayer";

export const SUPPORTED_CHAINS = [CHAIN_ID_ETH, CHAIN_ID_AVAX];
export type SupportedChainId = typeof SUPPORTED_CHAINS[number];

export type Addresses = Partial<{ [k in SupportedChainId]: string }>;
export type AddressesByEnvAndChain = {
  [e: string]: Addresses;
};

export const CIRCLE_EMITTER_ADDRESSES: AddressesByEnvAndChain = {
  [Environment.TESTNET]: {
    [CHAIN_ID_ETH]: "0x26413e8157cd32011e726065a5462e97dd4d03d9",
    [CHAIN_ID_AVAX]: "0xa9fb1b3009dcb79e2fe346c16a604b8fa8ae0a79",
  },
  [Environment.MAINNET]: {},
  [Environment.DEVNET]: {},
};

// USDC relayer contracts. We push the tx to these guys.
export const USDC_RELAYER_ADDRESSES: AddressesByEnvAndChain = {
  [Environment.TESTNET]: {
    [CHAIN_ID_ETH]: "0xbd227cd0513889752a792c98dab42dc4d952a33b",
    [CHAIN_ID_AVAX]: "0x45ecf5c7cf9e73954277cb7d932d5311b0f64982",
  },
  [Environment.MAINNET]: {
    [CHAIN_ID_ETH]: "",
    [CHAIN_ID_AVAX]: "",
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
    [CHAIN_ID_ETH]: "",
    [CHAIN_ID_AVAX]: "",
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
  [Environment.MAINNET]: "",
  [Environment.DEVNET]: "",
};
