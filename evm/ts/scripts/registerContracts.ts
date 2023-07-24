import { ethers } from "ethers";
import { RELEASE_CHAIN_ID, RELEASE_RPC, ZERO_BYTES32 } from "./consts";
import { tryHexToNativeString } from "@certusone/wormhole-sdk";
import { ICircleRelayer, ICircleRelayer__factory } from "../src/ethers-contracts";
import * as fs from "fs";
import { SignerArguments, addSignerArgsParser, getSigner } from "./signer";
import { Config, SupportedChainId, configArgsParser, isChain, isOperatingChain } from "./config";
import { Check, TxResult, buildOverrides, executeChecks, handleFailure } from "./tx";

interface CustomArguments {
  configPath: string;
}

type Arguments = CustomArguments & SignerArguments;

async function parseArgs(): Promise<Arguments> {
  const parser = addSignerArgsParser(configArgsParser());
  const parsed = await parser.argv;

  const args: Arguments = {
    configPath: parsed.config,
    useLedger: parsed.ledger,
    derivationPath: parsed.derivationPath,
  };

  return args;
}

async function registerContract(
  relayer: ICircleRelayer,
  chainId: SupportedChainId,
  contract: Uint8Array
): Promise<TxResult> {
  // query the contract and see if the contract is already registered
  const beforeRegistrationEmitter = await relayer.getRegisteredContract(chainId);
  if (beforeRegistrationEmitter !== ZERO_BYTES32) {
    return TxResult.Success(`Contract already registered for chainId=${chainId}`);
  }

  // register the emitter
  const overrides = await buildOverrides(
    () => relayer.estimateGas.registerContract(chainId, contract),
    RELEASE_CHAIN_ID
  );
  const tx = await relayer.registerContract(chainId, contract, overrides);
  console.log(`Register tx sent chainId=${chainId}, txHash=${tx.hash}`);
  const receipt = await tx.wait();

  const successMessage = `Registered chainId=${chainId}, txHash=${receipt.transactionHash}`;
  const failureMessage = `Failed to register chain=${chainId}`;
  return TxResult.create(receipt, successMessage, failureMessage, async () => {
    // query the contract and confirm that the emitter is set in storage
    const emitterInContractState: ethers.BytesLike = await relayer.getRegisteredContract(chainId);

    return emitterInContractState === ethers.utils.hexlify(contract);
  });
}

async function main() {
  const args = await parseArgs();

  // read config
  const { deployedContracts: contracts } = JSON.parse(
    fs.readFileSync(args.configPath, "utf8")
  ) as Config;

  if (!isOperatingChain(RELEASE_CHAIN_ID)) {
    throw new Error(`Transaction signing unsupported for wormhole chain id ${RELEASE_CHAIN_ID}`);
  }

  // setup ethers wallet
  const provider = new ethers.providers.StaticJsonRpcProvider(RELEASE_RPC);
  const wallet = await getSigner(args, provider);

  // fetch relayer address from config
  const relayerAddress = tryHexToNativeString(contracts[RELEASE_CHAIN_ID], RELEASE_CHAIN_ID);

  // setup relayer contract
  const relayer = ICircleRelayer__factory.connect(relayerAddress, wallet);

  const checks: Check[] = [];
  for (const [chainId_, contract] of Object.entries(contracts)) {
    const chainIdToRegister = Number(chainId_);
    if (!isChain(chainIdToRegister)) {
      throw new Error(`Unknown wormhole chain id ${chainIdToRegister}`);
    }
    // skip this chain
    if (chainIdToRegister === RELEASE_CHAIN_ID) {
      continue;
    }

    // format the address and register the chain
    const formattedAddress = ethers.utils.arrayify("0x" + contract);
    const result = await registerContract(relayer, chainIdToRegister, formattedAddress);
    handleFailure(checks, result);
  }

  const messages = await executeChecks(checks);
  console.log(messages);
}

main();
