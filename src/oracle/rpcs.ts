import { ethers } from "ethers";
import {
  CHAIN_ID_AVAX,
  CHAIN_ID_BSC,
  CHAIN_ID_CELO,
  CHAIN_ID_ETH,
  CHAIN_ID_FANTOM,
  CHAIN_ID_MOONBEAM,
  CHAIN_ID_POLYGON,
  CHAIN_ID_ARBITRUM,
} from "@certusone/wormhole-sdk";
import { Environment } from "@wormhole-foundation/relayer-engine";

const mainnetRpcs = {
  [CHAIN_ID_ETH]: new ethers.providers.JsonRpcProvider(
    process.env.ETH_RPC_HTTP ?? "https://rpc.ankr.com/eth"
  ),
  [CHAIN_ID_AVAX]: new ethers.providers.JsonRpcProvider(
    process.env.AVAX_RPC_HTTP ?? "https://api.avax.network/ext/bc/C/rpc"
  ),
  [CHAIN_ID_BSC]: new ethers.providers.JsonRpcProvider(
    process.env.BSC_RPC_HTTP ?? "https://bsc-dataseed1.binance.org/"
  ),
  [CHAIN_ID_FANTOM]: new ethers.providers.JsonRpcProvider(
    process.env.FTM_RPC_HTTP ?? "https://rpc.ftm.tools"
  ),
  [CHAIN_ID_CELO]: new ethers.providers.JsonRpcProvider(
    process.env.CELO_RPC_HTTP ?? "https://forno.celo.org"
  ),
  [CHAIN_ID_POLYGON]: new ethers.providers.JsonRpcProvider(
    process.env.POLYGON_RPC_HTTP ?? "https://rpc.ankr.com/polygon"
  ),
  [CHAIN_ID_MOONBEAM]: new ethers.providers.JsonRpcProvider(
    process.env.MOONBEAM_RPC_HTTP ?? "https://rpc.api.moonbeam.network"
  ),
  [CHAIN_ID_ARBITRUM]: new ethers.providers.JsonRpcProvider(
    process.env.ARBITRUM_RPC_HTTP ?? "https://arb1.arbitrum.io/rpc"
  ),
};

const testnetRpcs = {
  [CHAIN_ID_ETH]: new ethers.providers.JsonRpcProvider(
    process.env.ETH_RPC_HTTP ??
      "https://eth-goerli.g.alchemy.com/v2/mvFFcUhFfHujAOewWU8kH5D1R2bgFgLt"
  ),
  [CHAIN_ID_AVAX]: new ethers.providers.JsonRpcProvider(
    process.env.AVAX_RPC_HTTP ?? "https://api.avax-test.network/ext/bc/C/rpc"
  ),
  [CHAIN_ID_BSC]: new ethers.providers.JsonRpcProvider(
    process.env.BSC_RPC_HTTP ?? "https://data-seed-prebsc-1-s3.binance.org:8545"
  ),
  [CHAIN_ID_FANTOM]: new ethers.providers.JsonRpcProvider(
    process.env.FTM_RPC_HTTP ?? "https://rpc.ankr.com/fantom_testnet"
  ),
  [CHAIN_ID_CELO]: new ethers.providers.JsonRpcProvider(
    process.env.CELO_RPC_HTTP ?? "https://alfajores-forno.celo-testnet.org"
  ),
  [CHAIN_ID_POLYGON]: new ethers.providers.JsonRpcProvider(
    process.env.POLYGON_RPC_HTTP ?? "https://matic-mumbai.chainstacklabs.com"
  ),
  [CHAIN_ID_MOONBEAM]: new ethers.providers.JsonRpcProvider(
    process.env.MOONBEAM_RPC_HTTP ?? "https://rpc.testnet.moonbeam.network"
  ),
  [CHAIN_ID_ARBITRUM]: new ethers.providers.JsonRpcProvider(
    process.env.ARBITRUM_RPC_HTTP ?? "https://arbitrum-goerli.public.blastapi.io"
  ),
};

export const rpcsByEnv = {
  [Environment.MAINNET]: mainnetRpcs,
  [Environment.TESTNET]: testnetRpcs,
  [Environment.DEVNET]: {},
};
