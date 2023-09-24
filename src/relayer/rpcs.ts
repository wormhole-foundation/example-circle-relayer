import { ethers } from "ethers";
import {
  CHAIN_ID_AVAX,
  CHAIN_ID_ETH,
  CHAIN_ID_ARBITRUM,
  CHAIN_ID_OPTIMISM,
  rpc,
} from "@certusone/wormhole-sdk";
import { Environment } from "@wormhole-foundation/relayer-engine";

const mainnetRpcs = {
  [CHAIN_ID_ETH]: { endpoints: ["https://rpc.ankr.com/eth"]},
  [CHAIN_ID_AVAX]: { endpoints: ["https://api.avax.network/ext/bc/C/rpc"]},
  [CHAIN_ID_ARBITRUM]: { endpoints: ["https://rpc.ankr.com/arbitrum"]},
  [CHAIN_ID_OPTIMISM]: { endpoints: ["https://optimism.api.onfinality.io/public"]},
};

const testnetRpcs = {
  [CHAIN_ID_ETH]: { endpoints: ["https://eth-goerli.g.alchemy.com/v2/mvFFcUhFfHujAOewWU8kH5D1R2bgFgLt"]},
  [CHAIN_ID_AVAX]: { endpoints: ["https://api.avax-test.network/ext/bc/C/rpc"]},
  [CHAIN_ID_ARBITRUM]: { endpoints: ["https://arbitrum-goerli.public.blastapi.io"]},
  [CHAIN_ID_OPTIMISM]: { endpoints: ["https://goerli.optimism.io"]},
};

export const rpcsByEnv = {
  [Environment.MAINNET]: mainnetRpcs,
  [Environment.TESTNET]: testnetRpcs,
  [Environment.DEVNET]: {},
};