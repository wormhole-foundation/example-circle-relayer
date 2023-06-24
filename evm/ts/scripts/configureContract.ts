import { ethers } from "ethers";
import { RELEASE_CHAIN_ID, RELEASE_RPC } from "./consts";
import { tryHexToNativeString } from "@certusone/wormhole-sdk";
import { ICircleRelayer, ICircleRelayer__factory } from "../src/ethers-contracts";
import * as fs from "fs";
import yargs from "yargs";
import { SignerArguments, addSignerArgsParser, getSigner } from "./signer";
import { Check, TxResult, buildOverrides, handleFailure } from "./tx";
import { Config, SupportedChainId } from "./config";

interface CustomArguments {
  setSwapRate: boolean;
  setRelayerFee: boolean;
  setMaxSwapAmount: boolean;
  configPath: string;
}

type Arguments = CustomArguments & SignerArguments;

async function parseArgs(): Promise<Arguments> {
  const baseParser = yargs(process.argv.slice(1))
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
    .option("config", {
      alias: "c",
      string: true,
      boolean: false,
      description: "Configuration filepath.",
      required: true,
    })
    .help("h")
    .alias("h", "help");
  const parser = addSignerArgsParser(baseParser);
  const parsed = await parser.argv;

  const args: Arguments = {
    setSwapRate: parsed.setSwapRate,
    setRelayerFee: parsed.setRelayerFee,
    setMaxSwapAmount: parsed.setMaxSwapAmount,
    configPath: parsed.config,
    useLedger: parsed.ledger,
    derivationPath: parsed.derivationPath,
  };

  return args;
}

async function updateSwapRate(
  relayer: ICircleRelayer,
  contract: string,
  swapRate: ethers.BigNumberish
): Promise<TxResult> {
  // convert swap rate into BigNumber
  const swapRateToUpdate = ethers.BigNumber.from(swapRate);

  // update the swap rate
  const overrides = buildOverrides(RELEASE_CHAIN_ID);
  const tx = await relayer.updateNativeSwapRate(RELEASE_CHAIN_ID, contract, swapRateToUpdate, overrides);
  const receipt = await tx.wait();
  const successMessage = `Success: swap rate updated, swapRate=${swapRate}, txHash=${receipt.transactionHash}`;

  return TxResult.create(receipt, successMessage, async () => {
    // query the contract and see if the token swap rate was set properly
    const swapRateInContract = await relayer.nativeSwapRate(contract);
    return swapRateInContract.eq(swapRateToUpdate);
  });
}

async function updateMaxNativeSwapAmount(
  relayer: ICircleRelayer,
  contract: string,
  maxNativeSwapAmount: ethers.BigNumberish
): Promise<TxResult> {
  // convert max native into BigNumber
  const maxNativeToUpdate = ethers.BigNumber.from(maxNativeSwapAmount);

  // set the max native swap amount
  const overrides = buildOverrides(RELEASE_CHAIN_ID);
  const tx = await relayer.updateMaxNativeSwapAmount(RELEASE_CHAIN_ID, contract, maxNativeToUpdate, overrides);
  const receipt = await tx.wait();
  const successMessage = `Success: max swap amount updated, token=${contract}, max=${maxNativeSwapAmount}, txHash=${receipt.transactionHash}`;

  return TxResult.create(receipt, successMessage, async () => {
    // query the contract and see if the max native swap amount was set correctly
    const maxNativeInContract = await relayer.maxNativeSwapAmount(contract);
    return maxNativeInContract.eq(maxNativeToUpdate);
  });
}

async function updateRelayerFee(
  relayer: ICircleRelayer,
  chainId: number,
  tokenContract: string,
  relayerFee: ethers.BigNumberish
): Promise<TxResult> {
  // convert USD fee to a BigNumber
  const relayerFeeToUpdate = ethers.BigNumber.from(relayerFee);

  // update the relayerFee
  const overrides = buildOverrides(RELEASE_CHAIN_ID);
  const tx = await relayer.updateRelayerFee(chainId, tokenContract, relayerFeeToUpdate, overrides);
  const receipt = await tx.wait();
  const successMessage = `Relayer fee updated for chainId=${chainId}, fee=${relayerFee}, txHash=${receipt.transactionHash}`;

  return TxResult.create(receipt, successMessage, async () => {
    // query the contract and see if the relayer fee was set properly
    const relayerFeeInContract = await relayer.relayerFee(chainId, tokenContract);
    return relayerFeeInContract.eq(relayerFeeToUpdate);
  });
}

async function main() {
  const args = await parseArgs();

  // read config
  const { deployedContracts: contracts, acceptedTokens: setupConfig } = JSON.parse(
    fs.readFileSync(args.configPath, "utf8")
  ) as Config;

  // set up ethers wallet
  const provider = new ethers.providers.StaticJsonRpcProvider(RELEASE_RPC);
  const wallet = await getSigner(args, provider);

  // fetch relayer address from config
  const relayerAddress = tryHexToNativeString(contracts[RELEASE_CHAIN_ID], RELEASE_CHAIN_ID);

  // set up relayer contract
  const relayer = ICircleRelayer__factory.connect(relayerAddress, wallet);

  const checks: Check[] = [];

  // loop through token config and set target parameters
  for (const [tokenSymbol, { tokenInfo, outboundRelayerFees }] of Object.entries(setupConfig)) {
    console.log(`Setting up ${tokenSymbol} on chain ${RELEASE_CHAIN_ID}`);

    // selected token
    const token = tokenInfo[RELEASE_CHAIN_ID];

    // format the token address
    const formattedAddress = ethers.utils.getAddress(token.address);

    // set the token -> USD swap rate
    if (args.setSwapRate) {
      const result = await updateSwapRate(relayer, formattedAddress, token.nativeSwapRate);

      const failureMessage = `Failed: could not update swap rates, token=${formattedAddress}`;
      handleFailure(checks, result, failureMessage);
    }

    // set max native swap amount for each token
    if (args.setMaxSwapAmount) {
      const result = await updateMaxNativeSwapAmount(
        relayer,
        formattedAddress,
        token.maxNativeSwapAmount
      );

      const failureMessage = `Failed: could not update max native swap amount, token=${formattedAddress}`;
      handleFailure(checks, result, failureMessage);
    }

    // update relayer fee for each chainId
    if (args.setRelayerFee) {
      for (const [chainId, fees] of Object.entries(outboundRelayerFees)) {
        const parsedChainId = Number(chainId) as SupportedChainId;
        // skip the release chain id
        if (parsedChainId === RELEASE_CHAIN_ID) {
          continue;
        }

        const result = await updateRelayerFee(relayer, parsedChainId, formattedAddress, fees);

        const failureMessage = `Failed: could not update the relayer fee, token=${formattedAddress}, chain=${chainId}`;
        handleFailure(checks, result, failureMessage);
      }
    }
  }

  const messages = (await Promise.all(checks.map((check) => check()))).join("\n");
  console.log(messages);
}

main();
