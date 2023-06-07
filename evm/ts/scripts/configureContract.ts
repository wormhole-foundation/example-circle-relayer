import {ethers} from "ethers";
import {RELEASE_CHAIN_ID, RELEASE_RPC, WALLET_PRIVATE_KEY} from "./consts";
import {tryHexToNativeString, ChainId} from "@certusone/wormhole-sdk";
import {ICircleRelayer__factory} from "../src/ethers-contracts";
import * as fs from "fs";
import yargs from "yargs";

interface Arguments {
  setSwapRate: boolean;
  setRelayerFee: boolean;
  setMaxSwapAmount: boolean;
}

// parsed command-line arguments
function parseArgs(): Arguments {
  const parsed: any = yargs(process.argv.slice(1))
    .option("setSwapRate", {
      alias: "s",
      string: false,
      boolean: true,
      description: "Toggle for setting token swap rates",
      required: true,
    })
    .option("setRelayerFee", {
      alias: "r",
      string: false,
      boolean: true,
      description: "Toggle for setting relayer fees",
      required: true,
    })
    .option("setMaxSwapAmount", {
      alias: "m",
      string: false,
      boolean: true,
      description: "Toggle for setting max native swap amount",
      required: true,
    })
    .help("h")
    .alias("h", "help").argv;

  const args: Arguments = {
    setSwapRate: parsed.setSwapRate,
    setRelayerFee: parsed.setRelayerFee,
    setMaxSwapAmount: parsed.setMaxSwapAmount,
  };

  return args;
}

async function updateSwapRate(
  relayer: ethers.Contract,
  contract: ethers.BytesLike,
  swapRate: string
): Promise<boolean> {
  let result: boolean = false;

  // convert swap rate into BigNumber
  const swapRateToUpdate = ethers.BigNumber.from(swapRate);

  // update the swap rate
  let receipt: ethers.ContractReceipt;
  try {
    receipt = await relayer
      .updateNativeSwapRate(RELEASE_CHAIN_ID, contract, swapRateToUpdate)
      .then((tx: ethers.ContractTransaction) => tx.wait())
      .catch((msg: any) => {
        // should not happen
        console.log(msg);
        return null;
      });
    console.log(
      `Success: swap rate updated, swapRate=${swapRate}, txHash=${receipt.transactionHash}`
    );
  } catch (e: any) {
    console.log(e);
  }

  // query the contract and see if the token swap rate was set properly
  const swapRateInContract: ethers.BigNumber = await relayer.nativeSwapRate(
    contract
  );
  if (swapRateInContract.eq(swapRateToUpdate)) {
    result = true;
  }

  return result;
}

async function updateMaxNativeSwapAmount(
  relayer: ethers.Contract,
  contract: ethers.BytesLike,
  maxNativeSwapAmount: string
): Promise<boolean> {
  let result: boolean = false;

  // convert max native into BigNumber
  const maxNativeToUpdate = ethers.BigNumber.from(maxNativeSwapAmount);

  // set the max native swap amount
  let receipt: ethers.ContractReceipt;
  try {
    receipt = await relayer
      .updateMaxNativeSwapAmount(RELEASE_CHAIN_ID, contract, maxNativeToUpdate)
      .then((tx: ethers.ContractTransaction) => tx.wait())
      .catch((msg: any) => {
        // should not happen
        console.log(msg);
        return null;
      });
    console.log(
      `Success: max swap amount updated, token=${contract}, max=${maxNativeSwapAmount}, txHash=${receipt.transactionHash}`
    );
  } catch (e: any) {
    console.log(e);
  }

  // query the contract and see if the max native swap amount was set correctly
  const maxNativeInContract: ethers.BigNumber =
    await relayer.maxNativeSwapAmount(contract);

  if (maxNativeInContract.eq(maxNativeToUpdate)) {
    result = true;
  }

  return result;
}

async function updateRelayerFee(
  relayer: ethers.Contract,
  chainId: Number,
  tokenContract: ethers.BytesLike,
  relayerFee: string
): Promise<boolean> {
  let result: boolean = false;

  // convert USD fee to a BigNumber
  const relayerFeeToUpdate = ethers.BigNumber.from(relayerFee);

  // update the relayerFee
  let receipt: ethers.ContractReceipt;
  try {
    receipt = await relayer
      .updateRelayerFee(chainId, tokenContract, relayerFeeToUpdate)
      .then((tx: ethers.ContractTransaction) => tx.wait())
      .catch((msg: any) => {
        // should not happen
        console.log(msg);
        return null;
      });
    console.log(
      `Relayer fee updated for chainId=${chainId}, fee=${relayerFee}, txHash=${receipt.transactionHash}`
    );
  } catch (e: any) {
    console.log(e);
  }

  // query the contract and see if the relayer fee was set properly
  const relayerFeeInContract: ethers.BigNumber = await relayer.relayerFee(
    chainId,
    tokenContract
  );

  if (relayerFeeInContract.eq(relayerFeeToUpdate)) {
    result = true;
  }

  return result;
}

async function main() {
  const args = parseArgs();

  // read config
  const configPath = `${__dirname}/../../cfg/deployment.json`;
  const relayerConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const contracts = relayerConfig["deployedContracts"];
  const setupConfig = relayerConfig["acceptedTokens"];

  // set up ethers wallet
  const provider = new ethers.providers.StaticJsonRpcProvider(RELEASE_RPC);
  const wallet = new ethers.Wallet(WALLET_PRIVATE_KEY, provider);

  // fetch relayer address from config
  const relayerAddress = tryHexToNativeString(
    contracts[RELEASE_CHAIN_ID.toString()],
    RELEASE_CHAIN_ID as ChainId
  );

  // set up relayer contract
  const relayer: ethers.Contract = ICircleRelayer__factory.connect(
    relayerAddress,
    wallet
  );

  // loop through token config and set target parameters
  for (const tokenSymbol of Object.keys(setupConfig)) {
    const tokenConfig = setupConfig[tokenSymbol]["tokenInfo"];

    console.log(`Setting up ${tokenSymbol} on chain ${RELEASE_CHAIN_ID}`);

    // selected token
    const token = tokenConfig[RELEASE_CHAIN_ID];

    // format the token address
    const formattedAddress = ethers.utils.getAddress(token.address);

    // set the token -> USD swap rate
    if (args.setSwapRate) {
      const result: boolean = await updateSwapRate(
        relayer,
        formattedAddress,
        token.nativeSwapRate
      );

      if (result === false) {
        console.log(
          `Failed: could not update swap rates, token=${formattedAddress}`
        );
      }
    }

    // set max native swap amount for each token
    if (args.setMaxSwapAmount) {
      const result: boolean = await updateMaxNativeSwapAmount(
        relayer,
        formattedAddress,
        token.maxNativeSwapAmount
      );

      if (result === false) {
        console.log(
          `Failed: could not update max native swap amount, token=${formattedAddress}`
        );
      }
    }

    // update relayer fee for each chainId
    if (args.setRelayerFee) {
      const relayerFeeConfig = setupConfig[tokenSymbol]["outboundRelayerFees"];

      for (const chainId of Object.keys(relayerFeeConfig)) {
        // skip the release chain id
        if (Number(chainId) == RELEASE_CHAIN_ID) {
          continue;
        }

        const result: boolean = await updateRelayerFee(
          relayer,
          Number(chainId),
          formattedAddress,
          relayerFeeConfig[chainId]
        );

        if (result === false) {
          console.log(
            `Failed: could not update the relayer fee, token=${formattedAddress}, chain=${chainId}`
          );
        }
      }
    }
  }
}

main();
