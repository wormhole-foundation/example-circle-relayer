import * as fs from "fs";

export interface RelayerConfig {
  chainId: number;
  nativeId: string;
  tokenId: string;
  tokenContract: string;
}

export interface Config {
  fetchPricesInterval: number;
  updatePriceChangePercentage: number;
  pricePrecision: number;
  relayers: RelayerConfig[];
}

export function readConfig(configPath: string): Config {
  const config: Config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  return config;
}
