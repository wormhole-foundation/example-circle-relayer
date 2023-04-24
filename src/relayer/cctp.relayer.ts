import { WriteApi } from "@influxdata/influxdb-client";
import { ethers } from "ethers";
import {
  CircleVaaPayload,
  integrationContract,
  parseVaaPayload,
  relayerContract,
} from "../common/contracts";
import {
  Addresses,
  CIRCLE_CONTRACT_ADDRESSES,
  SupportedChainId,
  USDC_DECIMALS,
  USDC_RELAYER_ADDRESSES,
  USDC_WH_SENDER,
} from "../common/const";
import {
  coalesceChainName,
  tryUint8ArrayToNative,
  uint8ArrayToHex,
} from "@certusone/wormhole-sdk";
import { handleCircleMessageInLogs } from "./circle.api";
import { CctpRelayerContext } from "./index";
import { Environment, Next } from "@wormhole-foundation/relayer-engine";
import { RelayStatus } from "../data/relay.model";

function nanoToMs(nanos: number) {
  return nanos / 1e6;
}

export class CctpRelayer {
  private readonly circleAddresses: Addresses;
  private readonly usdcRelayerAddresses: Addresses;
  private readonly usdcWhSenderAddresses: Addresses;

  constructor(public env: Environment, private writeApi?: WriteApi) {
    this.circleAddresses = CIRCLE_CONTRACT_ADDRESSES[env];
    this.usdcRelayerAddresses = USDC_RELAYER_ADDRESSES[env];
    this.usdcWhSenderAddresses = USDC_WH_SENDER[env];
  }

  handleVaa = async (ctx: CctpRelayerContext, next: Next) => {
    const { vaaBytes, logger, vaa, relay: r } = ctx;
    const job = ctx.storage.job;

    // 1. Make sure we want to process this VAA (going from and to circle domains that we know about, the payload is valid, etc.)
    if (!vaa || !vaaBytes) {
      logger.error("Could not find a vaa in ctx");
      throw new Error("No vaa in context");
    }

    if (!ctx.sourceTxHash) {
      logger.error("No tx hash");
      throw new Error("No tx hash found");
    }

    const sourceReceipt = await ctx.providers.evm[
      vaa.emitterChain as SupportedChainId
    ]![0].getTransactionReceipt(ctx.sourceTxHash);

    let payload: CircleVaaPayload;

    try {
      payload = parseVaaPayload(vaa.payload, logger);
    } catch (e: any) {
      logger.error("Skipping Circle VAA. Malformed payload: ", e);
      job.log(`Skipping Circle VAA. Malformed payload: ${e.message}`);
      throw e;
    }

    const {
      fromChain,
      toChain,
      nativeSourceTokenAddress,
      mintRecipient,
      amount,
      toNativeAmount,
      fromDomain,
      recipientWallet,
      feeAmount,
    } = payload;

    if (
      ethers.utils.getAddress(mintRecipient) !==
      ethers.utils.getAddress(this.usdcRelayerAddresses[toChain]!)
    ) {
      logger.warn(
        `Unknown mintRecipient: ${mintRecipient} for chainId: ${toChain}, terminating relay.`
      );
      job.log(
        `Unknown mintRecipient: ${mintRecipient} for chainId: ${toChain}, terminating relay.`
      );
      return;
    }

    const sourceChainName = coalesceChainName(fromChain);
    const targetChainName = coalesceChainName(toChain);

    logger.info(
      `Processing transaction from ${sourceChainName} to ${targetChainName}`
    );

    await job.updateProgress(25);

    // 2. Find the address of the encoded token on the target chain. The address
    // that is encoded in the payload is the address on the source chain.
    logger.debug("Fetching token address from target chain.");
    const targetTokenAddress = await integrationContract(
      this.usdcWhSenderAddresses[toChain]!,
      ctx.providers.evm[toChain]![0]
    ).fetchLocalTokenAddress(fromDomain, nativeSourceTokenAddress);

    await job.updateProgress(50);

    const contract = relayerContract(
      this.usdcRelayerAddresses[toChain]!,
      ctx.providers.evm[toChain]![0]
    );

    // 3. query for native amount to swap with contract
    const nativeSwapQuote = await contract.calculateNativeSwapAmountOut(
      tryUint8ArrayToNative(ethers.utils.arrayify(targetTokenAddress), toChain),
      toNativeAmount
    );
    const formattedQuotedNativeAtDestination =
      ethers.utils.formatEther(nativeSwapQuote);
    logger.info(
      `Native amount to swap with contract: ${formattedQuotedNativeAtDestination}`
    );

    await job.updateProgress(60);

    const targetRelayerAddress = this.usdcRelayerAddresses[toChain]!;

    // 4. extract from tx the circle log and from the circle attestation service the signature for that log
    logger.debug("Fetching Circle attestation");
    const { circleMessage, attestation } = await handleCircleMessageInLogs(
      this.env,
      sourceReceipt.logs,
      this.circleAddresses[fromChain]!,
      fromChain,
      logger
    );
    if (circleMessage === null || attestation === null) {
      throw new Error(`Error parsing receipt, txhash: ${ctx.sourceTxHash}`);
    }

    job.updateProgress(70);
    // keep metrics
    r.toChain = toChain;
    r.amountTransferred = Number(
      ethers.utils.formatUnits(amount, USDC_DECIMALS)
    );
    r.nativeAssetEstimated = Number(formattedQuotedNativeAtDestination);
    r.nativeAssetReceived = Number(formattedQuotedNativeAtDestination); // TODO: Change this when contract emits log with amount swapped
    r.senderWallet = sourceReceipt.from;
    r.recipientWallet = recipientWallet;
    r.feeAmount = Number(ethers.utils.formatUnits(feeAmount, USDC_DECIMALS));
    r.symbol = "USDC";
    r.amountToSwap = Number(
      ethers.utils.formatUnits(toNativeAmount, USDC_DECIMALS)
    );
    r.attempts = ctx.storage.job.attempts;
    const startedWaitingForWallet = process.hrtime();
    const swapMessage =
      r.amountToSwap > 0
        ? `Swapping ${r.amountToSwap} USDC for ${r.nativeAssetEstimated} ${r.nativeAssetSymbol}.`
        : "";
    const msg = `Processing ${ethers.utils.formatUnits(
      toNativeAmount,
      USDC_DECIMALS
    )} USDC sent from ${
      r.senderWallet
    } in  ${sourceChainName} to ${recipientWallet} in ${targetChainName}. ${swapMessage}`;
    job.log(msg);
    logger.info(msg);
    await ctx.wallets.onEVM(toChain, async (walletToolBox) => {
      const [_, waitedInNanos] = process.hrtime(startedWaitingForWallet);
      r.metrics.waitingForWalletInMs = nanoToMs(waitedInNanos);
      try {
        // redeem parameters for target function call

        const { receipt, waitedForTxInMs } = await this.submitTx(
          ctx,
          targetRelayerAddress,
          walletToolBox.wallet,
          vaaBytes,
          circleMessage,
          attestation,
          nativeSwapQuote
        );
        r.evmReceipt = receipt;
        r.metrics.waitingForTxInMs = waitedForTxInMs;
        job.log(`Redeemed transfer in txhash: ${receipt.transactionHash}`);
      } catch (e: any) {
        if (e.error?.reason?.includes("already consumed")) {
          logger.info("Tx failed. This message has already been relayed.");
          return;
        }
        r.errorMessage = e.error?.reason;
        job.attempts >= ctx.storage.job.maxAttempts
          ? r.markFailed(e.error?.reason, 1)
          : r.markRetrying(job.attempts);
        job.log(
          `Error posting tx: ${e.error?.reason}. ${e.error?.code}. ${e.message}.`
        );
        throw e;
      } finally {
        if (r.status !== RelayStatus.WAITING) {
          // avoid pushing to influx if we're still retrying
          this.writeApi?.writePoint(r.point);
        }
      }
    });
    await next();
  };

  async submitTx(
    ctx: CctpRelayerContext,
    targetRelayerAddress: string,
    wallet: ethers.Wallet,
    vaaBytes: Uint8Array,
    circleMessage: string,
    attestation: string,
    nativeSwapQuote: ethers.BigNumber
  ) {
    const { logger, storage } = ctx;
    const job = storage.job;
    const contract = relayerContract(targetRelayerAddress, wallet);

    const redeemParameters = [
      `0x${uint8ArrayToHex(vaaBytes)}`,
      circleMessage,
      attestation,
    ];

    // 5. redeem the transfer on the target chain
    const startedWaitingForTx = process.hrtime();
    const tx: ethers.ContractTransaction = await contract.redeemTokens(
      redeemParameters,
      {
        value: nativeSwapQuote,
      }
    );

    job.updateProgress(90);
    let receipt: ethers.ContractReceipt = await tx.wait(1);
    ctx.relay.toTxHash = receipt.transactionHash;
    ctx.relay.save().catch((e: any) => {
      logger.error(`Error saving temporary tx hash in relay: ${e.message}`);
    });
    receipt = await tx.wait();

    const [_, waitedForTxInNanos] = process.hrtime(startedWaitingForTx);

    logger.info(`Redeemed transfer in txhash: ${receipt.transactionHash}`);
    return { receipt, waitedForTxInMs: nanoToMs(waitedForTxInNanos) };
  }
}
