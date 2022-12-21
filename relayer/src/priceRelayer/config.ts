import * as fs from "fs";

export interface RelayerConfig {
  chainId: number;
  nativeId: string;
  tokenId: string;
  tokenContract: string;
  pricePrecision: number;
}

export interface Config {
  fetchPricesInterval: number;
  updatePriceChangePercentage: number;
  relayers: RelayerConfig[];
}

export function readConfig(configPath: string): Config {
  const config: Config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  // check that there are no duplicate chainIds or rpcs
  const chainIds = new Set<number>();
  for (const relayerConfig of config.relayers) {
    // chainId
    const chainId = relayerConfig.chainId;
    if (chainIds.has(chainId)) {
      throw new Error("duplicate chainId found");
    }
    chainIds.add(chainId);
  }
  return config;
}
