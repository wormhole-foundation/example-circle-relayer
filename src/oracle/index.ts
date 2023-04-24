import { config } from "./config";
import {
  chainToCoingeckoId,
  getCoingeckoPrices,
  getCoingeckoTokens,
  usdcCoingeckoId,
} from "./coingecko";
import { SUPPORTED_CHAINS, SupportedChainId } from "../common/const";
import { getLogger } from "../common/logging";
import { ethers } from "ethers";
import { ChainId, coalesceChainName } from "@certusone/wormhole-sdk";

async function sleepFor(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function assertPricePrecisionOrThrow(expectedPrecision: number) {
  const pricePrecisionBN = ethers.utils.parseUnits("1", expectedPrecision);

  for (const chainId of SUPPORTED_CHAINS) {
    const relayer = config.relayerContracts[chainId];

    // fetch the contracts swap rate precision
    const swapRatePrecision: ethers.BigNumber =
      await relayer.nativeSwapRatePrecision();

    // compare it to the configured precision
    if (!swapRatePrecision.eq(pricePrecisionBN)) {
      console.error(
        `Swap Rate Precision does not match config chainId=${chainId}`
      );
      process.exit(1);
    }
  }
}

async function main() {
  const {
    minPriceChangePercentage,
    maxPriceChangePercentage,
    fetchPricesIntervalMs,
    env,
    logLevel,
  } = config;
  const logger = getLogger(env, logLevel);
  // create coingeckoId string
  const coingeckoIds = getCoingeckoTokens(SUPPORTED_CHAINS);
  logger.info(`Coingecko Id string: ${coingeckoIds}`);
  logger.info(`New price update interval: ${fetchPricesIntervalMs}`);
  logger.info(
    `Price update minimum percentage change: ${minPriceChangePercentage}%. Max percentage change: ${maxPriceChangePercentage}%`
  );

  // confirm the price precision on each contract
  await assertPricePrecisionOrThrow(config.pricePrecision);

  // get er done
  while (true) {
    // fetch native and token prices
    const coingeckoPrices = await getCoingeckoPrices(coingeckoIds).catch(
      (_) => null
    );

    if (coingeckoPrices === null) {
      logger.error("Failed to fetch coingecko prices!");
      await sleepFor(fetchPricesIntervalMs);
      continue;
    }
    // compute conversion rate for native -> token
    const priceUpdates = makeNativeCurrencyPrices(
      coingeckoPrices,
      config.pricePrecision
    );

    let updates = 0;
    // update contract prices
    for (const chainIdStr of SUPPORTED_CHAINS) {
      try {
        const chainId = Number(chainIdStr) as SupportedChainId;
        const tokenAddress = config.usdcAddresses[chainId];

        // fetch the relayer contract instance
        const relayer = config.relayerContracts[chainId];

        // query the contract to fetch the current native swap price
        const currentPrice: ethers.BigNumber = await relayer.nativeSwapRate(
          tokenAddress
        );
        const newPrice = priceUpdates.get(chainId)!;

        // compute percentage change
        const percentageChange = Math.abs(
          ((newPrice.toNumber() - currentPrice.toNumber()) /
            currentPrice.toNumber()) *
            100
        );

        // update prices if they have changed by the minPriceChangePercentage
        if (percentageChange < minPriceChangePercentage) {
          continue;
        }
        if (percentageChange > maxPriceChangePercentage) {
          logger.error(
            "CRITICAL: Price changed more than max percentage allowed",
            { percentageChange, maxPriceChangePercentage }
          );
        }
        updates++;

        logger.info(
          `Price update, chainId: ${chainId}, token: ${tokenAddress}, currentPrice: ${currentPrice}, newPrice: ${newPrice}`
        );

        const tx = await relayer.updateNativeSwapRate(
          chainId,
          tokenAddress,
          newPrice
        );
        const receipt = tx.wait();
        logger.info(
          `Updated native price on chainId: ${chainId}, token: ${tokenAddress}, txhash: ${receipt.transactionHash}`
        );
      } catch (e) {
        logger.error(
          `Error processing price update for chain: ${coalesceChainName(
            chainIdStr
          )}`,
          e
        );
      }
    }
    if (updates === 0) {
      logger.info("No updates this tick. Sleeping...");
    }
    await sleepFor(fetchPricesIntervalMs);
  }
}

function makeNativeCurrencyPrices(
  coingeckoPrices: any,
  pricePrecision: number
) {
  // price mapping
  const priceUpdates = new Map<ChainId, ethers.BigNumber>();

  const usdcPrice = coingeckoPrices[usdcCoingeckoId].usd;

  for (const chain of SUPPORTED_CHAINS) {
    const chainId = chain as SupportedChainId;
    const coingeckoIdForChain = chainToCoingeckoId[chainId];
    const nativeAssetPrice = coingeckoPrices[coingeckoIdForChain].usd;
    const swapRate = (nativeAssetPrice / usdcPrice).toFixed(6);
    // push native -> token swap rate
    priceUpdates.set(
      chainId,
      ethers.utils.parseUnits(swapRate, pricePrecision)
    );
  }
  return priceUpdates;
}

main();
