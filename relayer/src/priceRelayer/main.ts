import {ChainId, CHAIN_ID_ETH, CHAIN_ID_AVAX} from "@certusone/wormhole-sdk";
import {ethers} from "ethers";
import {Config, readConfig, RelayerConfig} from "./config";
const axios = require("axios"); // import breaks

require("dotenv").config();

const strip0x = (str: string) =>
  str.startsWith("0x") ? str.substring(2) : str;

// eth + avax shared key
let ethKey = process.env.ETH_KEY;
if (!ethKey) {
  console.error("ETH_KEY is required!");
  process.exit(1);
}
const PK = new Uint8Array(Buffer.from(strip0x(ethKey), "hex"));

// eth RPC, signer and provider
const ETH_RPC = process.env.ETH_RPC_HTTP;
if (!ETH_RPC || !ETH_RPC.startsWith("https")) {
  console.error("ETH_RPC required!");
  process.exit(1);
}

// avax RPC, signer and provider
const AVAX_RPC = process.env.AVAX_RPC_HTTP;
if (!AVAX_RPC || !AVAX_RPC.startsWith("https")) {
  console.error("AVAX_RPC required!");
  process.exit(1);
}

// supported chains
const SUPPORTED_CHAINS = [CHAIN_ID_ETH, CHAIN_ID_AVAX];
type SupportedChainId = typeof SUPPORTED_CHAINS[number];

// circle relayer contract addresses
const USDC_RELAYER = {
  [CHAIN_ID_ETH]: "0xbd227cd0513889752a792c98dab42dc4d952a33b",
  [CHAIN_ID_AVAX]: "0x45ecf5c7cf9e73954277cb7d932d5311b0f64982",
};

// rpc provider
const PROVIDERS = {
  [CHAIN_ID_ETH]: new ethers.providers.JsonRpcProvider(ETH_RPC),
  [CHAIN_ID_AVAX]: new ethers.providers.JsonRpcProvider(AVAX_RPC),
};

// wallets
const SIGNERS = {
  [CHAIN_ID_ETH]: new ethers.Wallet(PK, PROVIDERS[CHAIN_ID_ETH]),
  [CHAIN_ID_AVAX]: new ethers.Wallet(PK, PROVIDERS[CHAIN_ID_AVAX]),
};

// circle relayer contract instances
async function sleepFor(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function relayerContract(
  address: string,
  signer: ethers.Signer
): ethers.Contract {
  const contract = new ethers.Contract(
    address,
    [
      "function nativeSwapRate(address) public view returns (uint256)",
      "function updateNativeSwapRate(uint16,address,uint256) public",
      "function nativeSwapRatePrecision() public view returns (uint256)",
    ],
    signer
  );

  return contract;
}

async function confirmPricePrecision(expectedPrecision: number) {
  const pricePrecisionBN = ethers.utils.parseUnits("1", expectedPrecision);

  for (const chainId of SUPPORTED_CHAINS) {
    const relayer = relayerContract(USDC_RELAYER[chainId], SIGNERS[chainId]);

    // fetch the contracts swap rate precision
    const swapRatePrecision: ethers.BigNumber =
      await relayer.nativeSwapRatePrecision();
    console.log(swapRatePrecision, pricePrecisionBN);

    // compare it to the configured precision
    if (!swapRatePrecision.eq(pricePrecisionBN)) {
      console.error(
        `Swap Rate Precision does not match config chainId=${chainId}`
      );
      process.exit(1);
    }
  }
}

function createCoingeckoString(relayerConfig: Config): string {
  // cache variables from relayer config
  let uniqueIds: string[] = [];
  for (const config of relayerConfig.relayers) {
    if (!uniqueIds.includes(config.nativeId)) {
      uniqueIds.push(config.nativeId);
    }
    if (!uniqueIds.includes(config.tokenId)) {
      uniqueIds.push(config.tokenId);
    }
  }
  return uniqueIds.join(",");
}

async function main() {
  // read price relayer config
  const configPath = `${__dirname}/../../cfg/priceRelayer.json`;
  const relayerConfig = readConfig(configPath);

  // create coingeckoId string
  const coingeckoIds = createCoingeckoString(relayerConfig);
  console.log(`Coingecko Id string: ${coingeckoIds}`);

  // price update interval and percentage change
  const fetchPricesInterval = relayerConfig.fetchPricesInterval;
  console.log(`New price update interval: ${fetchPricesInterval}`);

  const minPriceChangePercentage = relayerConfig.updatePriceChangePercentage;
  console.log(
    `Price update minimum percentage change: ${minPriceChangePercentage}%`
  );

  // confirm the price precision on each contract
  await confirmPricePrecision(relayerConfig.pricePrecision);

  // get er done
  while (true) {
    // fetch native and token prices
    const coingeckoPrices = await getCoingeckoPrices(coingeckoIds).catch(
      (_) => null
    );

    if (coingeckoPrices !== null) {
      try {
        // compute conversion rate for native -> token
        const priceUpdates = makeNativeCurrencyPrices(
          relayerConfig.relayers,
          coingeckoPrices,
          relayerConfig.pricePrecision
        );

        // update contract prices
        for (const config of relayerConfig.relayers) {
          const chainId = config.chainId as SupportedChainId;
          const token = config.tokenContract;

          // fetch the relayer contract instance
          const contract = relayerContract(
            USDC_RELAYER[chainId],
            SIGNERS[chainId]
          );

          // query the contract to fetch the current native swap price
          const currentPrice: ethers.BigNumber = await contract.nativeSwapRate(
            token
          );
          const newPrice = priceUpdates.get(chainId)!;

          // compute percentage change
          const percentageChange =
            ((newPrice.toNumber() - currentPrice.toNumber()) /
              currentPrice.toNumber()) *
            100;

          console.log(
            `Price update, chainId: ${chainId}, token: ${token}, currentPrice: ${currentPrice}, newPrice: ${newPrice}`
          );

          try {
            // update prices if they have changed by the minPriceChangePercentage
            if (Math.abs(percentageChange) > minPriceChangePercentage) {
              const gasParams = await PROVIDERS[chainId].getFeeData();

              const receipt = await contract
                .updateNativeSwapRate(chainId, token, newPrice)
                .then((tx: ethers.ContractTransaction) => tx.wait())
                .catch((msg: any) => {
                  // should not happen
                  console.log(msg);
                  return null;
                });

              console.log(
                `Updated native price on chainId: ${chainId}, token: ${token}, txhash: ${receipt.transactionHash}`
              );
            }
          } catch (e) {
            console.error(e);
          }
        }
      } catch (e) {
        console.error(e);
      }
    } else {
      console.error("Failed to fetch coingecko prices!");
    }
    await sleepFor(fetchPricesInterval);
  }
}

function makeNativeCurrencyPrices(
  relayerConfigs: RelayerConfig[],
  coingeckoPrices: any,
  pricePrecision: number
) {
  // price mapping
  const priceUpdates = new Map<ChainId, ethers.BigNumber>();

  // loop through each config, compute conversion rates and save results
  for (let i = 0; i < relayerConfigs.length; ++i) {
    const config = relayerConfigs.at(i)!;
    const id = config.nativeId;
    const tokenId = config.tokenId;

    if (id in coingeckoPrices && tokenId in coingeckoPrices) {
      // cache prices
      const nativePrice = coingeckoPrices[id].usd;
      const tokenPrice = coingeckoPrices[tokenId].usd;

      // compute native -> token conversion rate
      const swapRate = (nativePrice / tokenPrice).toFixed(3);

      // push native -> token swap rate
      priceUpdates.set(
        config.chainId as ChainId,
        ethers.utils.parseUnits(swapRate, pricePrecision)
      );
    }
  }
  return priceUpdates;
}

async function getCoingeckoPrices(coingeckoIds: string) {
  const {data, status} = await axios.get(
    `https://api.coingecko.com/api/v3/simple/price?ids=${coingeckoIds}&vs_currencies=usd`,
    {
      headers: {
        Accept: "application/json",
      },
    }
  );

  if (status != 200) {
    return Promise.reject("status != 200");
  }

  return data;
}

main();
