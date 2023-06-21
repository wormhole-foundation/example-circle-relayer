import {
  CHAIN_ID_ARBITRUM,
  CHAIN_ID_AVAX,
  CHAIN_ID_ETH,
} from "@certusone/wormhole-sdk";
import { SupportedChainId } from "../common/supported-chains.config";

const axios = require("axios"); // import breaks

export const chainToCoingeckoId = {
  [CHAIN_ID_ETH]: "ethereum",
  [CHAIN_ID_AVAX]: "avalanche-2",
  [CHAIN_ID_ARBITRUM]: "ethereum",
};

export const usdcCoingeckoId = "usd-coin";

export const getCoingeckoTokens = (chains: SupportedChainId[]) => {
  return chains.map((c) => chainToCoingeckoId[c]).concat(usdcCoingeckoId);
};

export async function getCoingeckoPrices(tokens: string[] | string) {
  tokens = typeof tokens === "string" ? tokens : [...new Set(tokens)].join(",");
  const { data, status } = await axios.get(
    `https://api.coingecko.com/api/v3/simple/price?ids=${tokens}&vs_currencies=usd`,
    {
      headers: {
        Accept: "application/json",
      },
    }
  );

  if (status !== 200) {
    throw new Error("status != 200");
  }

  return data;
}
