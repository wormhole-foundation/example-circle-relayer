import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { SignerArguments, addSignerArgsParser } from "./signer";

export type OperatingChainId = 2 | 6 | 23 | 24 | 30;
export type SupportedChainId = OperatingChainId;

export interface ConfigArguments {
  config: string;
}

export interface Config {
  deployedContracts: Record<SupportedChainId, string>;
  acceptedTokens: {
    USDC: {
      tokenInfo: Record<
        SupportedChainId,
        {
          address: string;
          nativeSwapRate: string;
          maxNativeSwapAmount: string;
        }
      >;
      outboundRelayerFees: Record<SupportedChainId, string>;
    };
  };
}

/**
 * These are the chains that we talk about in our configuration payloads.
 * These should include all the chains where the CCTP relayer is deployed on.
 */
export function isChain(chainId: number): chainId is SupportedChainId {
  return isOperatingChain(chainId);
}

/**
 * These are the chains where we sign and send transactions.
 * We currently only support EVM chains in these scripts.
 */
export function isOperatingChain(chainId: number): chainId is OperatingChainId {
  return chainId === 2 || chainId === 6 || chainId === 23 || chainId === 24 || chainId === 30;
}

export function configArgsParser(): yargs.Argv<ConfigArguments> {
  const parser = yargs(hideBin(process.argv))
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
  return parser;
}

export type Arguments = ConfigArguments & SignerArguments;

export async function parseArgs(): Promise<Arguments> {
  const parser = addSignerArgsParser(configArgsParser());
  const args = await parser.argv;
  return {
    config: args.config,
    useLedger: args.ledger,
    derivationPath: args.derivationPath,
  };
}
