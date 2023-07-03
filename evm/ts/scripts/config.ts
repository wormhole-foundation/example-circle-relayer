import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { SignerArguments, addSignerArgsParser } from "./signer";

export type SupportedChainId = 2 | 6 | 23;

export interface ConfigArguments {
    config: string;
}

export interface Config {
    deployedContracts: Record<SupportedChainId, string>;
    acceptedTokens: {
        USDC: {
            tokenInfo: Record<SupportedChainId, {
                address: string;
                nativeSwapRate: string;
                maxNativeSwapAmount: string;
            }>;
            outboundRelayerFees: Record<SupportedChainId, string>;
        }
    }
}

export function isChain(chainId: number): chainId is SupportedChainId {
    return (
        chainId === 2 ||
        chainId === 6 ||
        chainId === 23
    );
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