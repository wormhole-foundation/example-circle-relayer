import { ethers } from "ethers";
import { RELEASE_CHAIN_ID, RELEASE_RPC } from "./consts";
import { tryHexToNativeString } from "@certusone/wormhole-sdk";
import { ICircleRelayer, ICircleRelayer__factory } from "../src/ethers-contracts";
import * as fs from "fs";
import { SignerArguments, addSignerArgsParser, getSigner } from "./signer";
import { Check, TxResult, buildOverrides, executeChecks, handleFailure } from "./tx";
import { Config, SupportedChainId, configArgsParser, isChain, isOperatingChain } from "./config";

interface CustomArguments {
  setSwapRate: boolean;
  setRelayerFee: boolean;
  setMaxSwapAmount: boolean;
  configPath: string;
}

type Arguments = CustomArguments & SignerArguments;

async function parseArgs(): Promise<Arguments> {
  const parser = addSignerArgsParser(configArgsParser())
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
    });
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
  token: string,
  swapRate: ethers.BigNumberish
): Promise<TxResult> {
  const currentSwapRate = await relayer.nativeSwapRate(token);
  if (currentSwapRate.eq(swapRate)) {
    console.log(`Swap rate for token=${token} already set to swapRate=${swapRate}`);
    return TxResult.Success("");
  }

  // Builds tx overrides according to operating chain
  const overrides = await buildOverrides(
    () => relayer.estimateGas.updateNativeSwapRate(RELEASE_CHAIN_ID, token, swapRate),
    RELEASE_CHAIN_ID
  );
  const tx = await relayer.updateNativeSwapRate(RELEASE_CHAIN_ID, token, swapRate, overrides);
  console.log(`Swap rate update tx sent, swapRate=${swapRate}, txHash=${tx.hash}`);
  const receipt = await tx.wait();

  const successMessage = `Success: swap rate updated, swapRate=${swapRate}, txHash=${receipt.transactionHash}`;
  const failureMessage = `Failed: could not update swap rates, token=${token}`;
  return TxResult.create(receipt, successMessage, failureMessage, async () => {
    // query the contract and see if the token swap rate was set properly
    const swapRateInContract = await relayer.nativeSwapRate(token);
    return swapRateInContract.eq(swapRate);
  });
}

async function updateMaxNativeSwapAmount(
  relayer: ICircleRelayer,
  token: string,
  maxNativeSwapAmount: ethers.BigNumberish
): Promise<TxResult> {
  const currentMaxNativeSwapAmount = await relayer.maxNativeSwapAmount(token);
  if (currentMaxNativeSwapAmount.eq(maxNativeSwapAmount)) {
    console.log(
      `Max native swap amount for token=${token} already set to maxNativeSwapAmount=${maxNativeSwapAmount}`
    );
    return TxResult.Success("");
  }

  // Builds tx overrides according to operating chain
  const overrides = await buildOverrides(
    () =>
      relayer.estimateGas.updateMaxNativeSwapAmount(RELEASE_CHAIN_ID, token, maxNativeSwapAmount),
    RELEASE_CHAIN_ID
  );
  const tx = await relayer.updateMaxNativeSwapAmount(
    RELEASE_CHAIN_ID,
    token,
    maxNativeSwapAmount,
    overrides
  );
  console.log(
    `Max swap amount update tx sent, token=${token}, max=${maxNativeSwapAmount}, txHash=${tx.hash}`
  );
  const receipt = await tx.wait();

  const successMessage = `Success: max swap amount updated, token=${token}, max=${maxNativeSwapAmount}, txHash=${receipt.transactionHash}`;
  const failureMessage = `Failed: could not update max native swap amount, token=${token}`;
  return TxResult.create(receipt, successMessage, failureMessage, async () => {
    // query the contract and see if the max native swap amount was set correctly
    const maxNativeInContract = await relayer.maxNativeSwapAmount(token);
    return maxNativeInContract.eq(maxNativeSwapAmount);
  });
}

async function updateRelayerFee(
  relayer: ICircleRelayer,
  chainId: SupportedChainId,
  tokenContract: string,
  relayerFee: ethers.BigNumberish
): Promise<TxResult> {
  const currentFee = await relayer.relayerFee(chainId, tokenContract);
  if (currentFee.eq(relayerFee)) {
    console.log(`Relayer fee for chainId=${chainId} already set to fee=${relayerFee}`);
    return TxResult.Success("");
  }

  // Builds tx overrides according to operating chain
  const overrides = await buildOverrides(
    () => relayer.estimateGas.updateRelayerFee(chainId, tokenContract, relayerFee),
    RELEASE_CHAIN_ID
  );
  const tx = await relayer.updateRelayerFee(chainId, tokenContract, relayerFee, overrides);
  const receipt = await tx.wait();

  const successMessage = `Relayer fee updated for chainId=${chainId}, fee=${relayerFee}, txHash=${receipt.transactionHash}`;
  const failureMessage = `Failed: could not update the relayer fee, token=${tokenContract}, chain=${chainId}`;
  return TxResult.create(receipt, successMessage, failureMessage, async () => {
    // query the contract and see if the relayer fee was set properly
    const relayerFeeInContract = await relayer.relayerFee(chainId, tokenContract);
    return relayerFeeInContract.eq(relayerFee);
  });
}

async function main() {
  const args = await parseArgs();

  // read config
  const { deployedContracts: contracts, acceptedTokens: setupConfig } = JSON.parse(
    fs.readFileSync(args.configPath, "utf8")
  ) as Config;

  if (!isOperatingChain(RELEASE_CHAIN_ID)) {
    throw new Error(`Transaction signing unsupported for wormhole chain id ${RELEASE_CHAIN_ID}`);
  }

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
      handleFailure(checks, result);
    }

    // set max native swap amount for each token
    if (args.setMaxSwapAmount) {
      const result = await updateMaxNativeSwapAmount(
        relayer,
        formattedAddress,
        token.maxNativeSwapAmount
      );
      handleFailure(checks, result);
    }

    // update relayer fee for each chainId
    if (args.setRelayerFee) {
      for (const [chainId, fees] of Object.entries(outboundRelayerFees)) {
        const parsedChainId = Number(chainId);
        if (!isChain(parsedChainId)) {
          throw new Error(`Unknown wormhole chain id ${parsedChainId}`);
        }
        // skip the chain on which we're signing txs
        if (parsedChainId === RELEASE_CHAIN_ID) {
          continue;
        }

        const result = await updateRelayerFee(relayer, parsedChainId, formattedAddress, fees);
        handleFailure(checks, result);
      }
    }
  }

  const messages = await executeChecks(checks);
  console.log(messages);
}

main();
