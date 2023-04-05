import { Environment } from "wormhole-relayer/lib";

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

export const config = {
  env: getBlockchainEnv(process.env.BLOCKCHAIN_ENV ?? ""), // TODO validate and parse properly
};
