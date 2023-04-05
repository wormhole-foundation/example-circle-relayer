import { StandardRelayerApp, UnrecoverableError } from "wormhole-relayer";
import { config } from "./config";
import {
  CIRCLE_EMITTER_ADDRESSES,
  USDC_RELAYER_ADDRESSES,
  USDC_WH_SENDER,
} from "./const";
import {
  coalesceChainName,
  tryUint8ArrayToNative,
  uint8ArrayToHex,
} from "@certusone/wormhole-sdk";
import {
  integrationContract,
  parseVaaPayload,
  relayerContract,
} from "./contracts";
import { ethers } from "ethers";
import { Environment } from "wormhole-relayer/lib";
import { getCircleAttestation } from "./circle.service";

async function main() {
  const env = config.env;

  const circleAddresses = CIRCLE_EMITTER_ADDRESSES[env];
  const usdcRelayerAddresses = USDC_RELAYER_ADDRESSES[env];
  const usdcWhSenderAddresses = USDC_WH_SENDER[env];

  const app = new StandardRelayerApp(env, {
    name: "cctp-relayer",
    fetchSourceTxhash: true,
    redis: {},
  });

  app.multiple(usdcWhSenderAddresses, async (ctx, next) => {
    const { vaaBytes, logger, vaa } = ctx;
    if (!vaa || !vaaBytes) {
      logger.error("Could not find a vaa in ctx");
      throw new Error("No vaa in context");
    }
    if (!ctx.sourceTxHash) {
      throw new Error("No tx hash found");
    }
    const {
      fromChain,
      toChain,
      nativeSourceTokenAddress,
      mintRecipient,
      toNativeAmount,
      fromDomain,
    } = parseVaaPayload(vaa.payload, logger);

    if (
      ethers.utils.getAddress(mintRecipient) !==
      ethers.utils.getAddress(usdcRelayerAddresses[fromChain]!)
    ) {
      logger.warn(
        `Unknown mintRecipient: ${mintRecipient} for chainId: ${toChain}, terminating relay`
      );
      return;
    }
    logger.info(
      `Processing transaction from ${coalesceChainName(
        fromChain
      )} to ${coalesceChainName(toChain)}`
    );
    if (!ctx.providers.evm[fromChain]?.length) {
      throw new UnrecoverableError("No ");
    }

    const receipt = await ctx.providers.evm[
      fromChain
    ]![0].getTransactionReceipt(ctx.sourceTxHash);

    logger.debug("Fetching Circle attestation");
    const { circleMessage, signature } = await handleCircleMessageInLogs(
      env,
      receipt.logs,
      circleAddresses[fromChain]!
    );
    if (circleMessage === null || signature === null) {
      throw new Error(`Error parsing receipt, txhash: ${ctx.sourceTxHash}`);
    }

    // redeem parameters for target function call
    const redeemParameters = [
      `0x${uint8ArrayToHex(vaaBytes)}`,
      circleMessage,
      signature,
    ];
    logger.debug("All redeem parameters have been located");

    await ctx.wallets.onEVM(toChain, async (walletToolBox) => {
      // create target contract instance
      const contract = relayerContract(
        usdcRelayerAddresses[toChain]!,
        walletToolBox.wallet
      );

      // Find the address of the encoded token on the target chain. The address
      // that is encoded in the payload is the address on the source chain.
      console.log("Fetching token address from target chain.");
      const targetTokenAddress = await integrationContract(
        usdcWhSenderAddresses[toChain]!,
        walletToolBox.wallet
      ).fetchLocalTokenAddress(fromDomain, nativeSourceTokenAddress);

      // query for native amount to swap with contract
      const nativeSwapQuote = await contract.calculateNativeSwapAmountOut(
        tryUint8ArrayToNative(
          ethers.utils.arrayify(targetTokenAddress),
          toChain
        ),
        toNativeAmount
      );
      console.log(
        `Native amount to swap with contract: ${ethers.utils.formatEther(
          nativeSwapQuote
        )}`
      );

      // redeem the transfer on the target chain
      const tx: ethers.ContractTransaction = await contract.redeemTokens(
        redeemParameters,
        {
          value: nativeSwapQuote,
        }
      );
      const redeedReceipt: ethers.ContractReceipt = await tx.wait();

      console.log(
        `Redeemed transfer in txhash: ${redeedReceipt.transactionHash}`
      );
    });
  });

  app.listen();
}

async function handleCircleMessageInLogs(
  env: Environment,
  logs: ethers.providers.Log[],
  circleEmitterAddress: string
) {
  const circleMessage = findCircleMessageInLogs(logs, circleEmitterAddress);
  if (circleMessage === null) {
    return { circleMessage: null, signature: null };
  }

  const circleMessageHash = ethers.utils.keccak256(circleMessage);
  const signature = await getCircleAttestation(env, circleMessageHash);

  return { circleMessage, signature };
}

function findCircleMessageInLogs(
  logs: ethers.providers.Log[],
  circleEmitterAddress: string
): string | null {
  for (const log of logs) {
    if (log.address === circleEmitterAddress) {
      const messageSentIface = new ethers.utils.Interface([
        "event MessageSent(bytes message)",
      ]);
      return messageSentIface.parseLog(log).args.message as string;
    }
  }

  return null;
}

main();
