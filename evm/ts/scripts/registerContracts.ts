import { ethers } from "ethers";
import { RELEASE_CHAIN_ID, RELEASE_RPC, WALLET_PRIVATE_KEY, ZERO_BYTES32 } from "./consts";
import { tryHexToNativeString, ChainId } from "@certusone/wormhole-sdk";
import { ICircleRelayer, ICircleRelayer__factory } from "../src/ethers-contracts";
import * as fs from "fs";
import yargs from "yargs";
import { SignerArguments, addSignerArgsParser, getSigner } from "./signer";
import { Config, SupportedChainId } from "./config";
import { Check, TxResult, buildOverrides, handleFailure } from "./tx";

interface CustomArguments {
  configPath: string;
}

type Arguments = CustomArguments & SignerArguments;

async function parseArgs(): Promise<Arguments> {
  const baseParser = yargs(process.argv.slice(1))
    .env("CONFIGURE_CCTP")
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
  const overrides = buildOverrides(RELEASE_CHAIN_ID);
  const tx = await relayer.registerContract(chainId, contract, overrides);
  const receipt = await tx.wait();
  const successMessage = `Registered chainId=${chainId}, txHash=${receipt.transactionHash}`;

  return TxResult.create(receipt, successMessage, async () => {
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

  // setup ethers wallet
  const provider = new ethers.providers.StaticJsonRpcProvider(RELEASE_RPC);
  const wallet = await getSigner(args, provider);

  // fetch relayer address from config
  const relayerAddress = tryHexToNativeString(contracts[RELEASE_CHAIN_ID], RELEASE_CHAIN_ID);

  // setup relayer contract
  const relayer = ICircleRelayer__factory.connect(relayerAddress, wallet);

  const checks: Check[] = []

  // loop through configured contracts and register them one at a time
  for (const [chainId_, contract] of Object.entries(contracts)) {
    const chainIdToRegister = Number(chainId_) as SupportedChainId;
    // skip this chain
    if (chainIdToRegister === RELEASE_CHAIN_ID) {
      continue;
    }

    // format the address and register the chain
    const formattedAddress = ethers.utils.arrayify("0x" + contract);

    const result = await registerContract(relayer, chainIdToRegister, formattedAddress);
    const failureMessage = `Failed to register chain=${chainId_}`;

    handleFailure(checks, result, failureMessage)
  }

  const messages = (await Promise.all(checks.map((check) => check()))).join("\n");
  console.log(messages);
}

main();
