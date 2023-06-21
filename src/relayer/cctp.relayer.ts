import { WriteApi } from "@influxdata/influxdb-client";
import { ethers } from "ethers";
import {
  CircleRelayerPayload,
  CircleVaaPayload,
  integrationContract,
  parseCCTPRelayerPayload,
  parseCCTPTransferPayload,
  relayerContract,
} from "../common/contracts";
import {
  Addresses,
  CIRCLE_CONTRACT_ADDRESSES,
  SupportedChainId,
  USDC_DECIMALS,
  USDC_RELAYER_ADDRESSES,
  USDC_WH_SENDER,
} from "../common/supported-chains.config";
import {
  coalesceChainName,
  tryUint8ArrayToNative,
  uint8ArrayToHex,
} from "@certusone/wormhole-sdk";
import { handleCircleMessageInLogs } from "./circle.api";
import { CctpRelayerContext } from "./index";
import {
  Environment,
  Next,
  UnrecoverableError,
} from "@wormhole-foundation/relayer-engine";
import { RelayStatus } from "../data/relay.model";
import { ParsedVaaWithBytes } from "@wormhole-foundation/relayer-engine/lib";

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

  preFilter = async (vaa: ParsedVaaWithBytes) => {
    // 1. Make sure we want to process this VAA (going from and to circle domains that we know about, the payload is valid, etc.)
    try {
      const { fromChain, from } = parseCCTPTransferPayload(vaa!.payload);
      const sourceRelayerAddress = this.usdcRelayerAddresses[fromChain]!;
      return (
        ethers.utils.getAddress(from) ===
        ethers.utils.getAddress(sourceRelayerAddress)
      );
    } catch (e: any) {
      return false;
    }
  };

  handleVaa = async (ctx: CctpRelayerContext, next: Next) => {
    const { vaaBytes, logger, vaa, relay: r } = ctx;
    const job = ctx.storage.job;
    const emitterChain = vaa!.emitterChain as SupportedChainId;

    let payload: CircleVaaPayload;

    if (!ctx.sourceTxHash) {
      logger.error("No tx hash");
      throw new Error("No tx hash found");
    }

    logger.info(`Source tx hash: ${ctx.sourceTxHash}`);

    try {
      payload = parseCCTPTransferPayload(vaa!.payload);
    } catch (e: any) {
      logger.error("Skipping Circle VAA. Malformed payload: ", e);
      throw new UnrecoverableError(e.message);
    }

    const {
      fromChain,
      toChain,
      nativeSourceTokenAddress,
      to,
      amount,
      fromDomain,
    } = payload;

    let relayerPayload: CircleRelayerPayload;
    try {
      relayerPayload = parseCCTPRelayerPayload(payload.payload, toChain);
    } catch (e: any) {
      logger.error("Skipping Circle Relayer VAA. Malformed payload: ", e);
      throw new UnrecoverableError(e.message);
    }

    const { feeAmount, toNativeAmount, recipientWallet, payloadId } =
      relayerPayload;

    if (payloadId > 1) {
      logger.error(
        `Skipping Circle Relayer VAA. Unknown payload id: ${payloadId}`
      );
      throw new UnrecoverableError("Unknown payload id");
    }

    // 1. Make sure we want to process this VAA (going from and to circle domains that we know about, the payload is valid, etc.)
    const targetRelayerAddress = this.usdcRelayerAddresses[toChain]!;
    if (
      ethers.utils.getAddress(to) !==
      ethers.utils.getAddress(targetRelayerAddress)
    ) {
      logger.error(
        `Contracts or relayer misconfigured: Unknown mintRecipient: ${to} for chainId: ${toChain} (configured: ${targetRelayerAddress}), terminating relay.`
      );
      throw new UnrecoverableError(`Unknown mintRecipient: ${to}`);
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
    const usdcAddressInTargetChain = await integrationContract(
      this.usdcWhSenderAddresses[toChain]!,
      ctx.providers.evm[toChain]![0]
    ).fetchLocalTokenAddress(fromDomain, nativeSourceTokenAddress);

    await job.updateProgress(50);

    const relayer = relayerContract(
      targetRelayerAddress,
      ctx.providers.evm[toChain]![0]
    );

    // 3. query for native amount to swap with contract
    const nativeSwapQuote = await relayer.calculateNativeSwapAmountOut(
      tryUint8ArrayToNative(
        ethers.utils.arrayify(usdcAddressInTargetChain),
        toChain
      ),
      toNativeAmount // 1000000000
    );
    const formattedQuotedNativeAtDestination =
      ethers.utils.formatEther(nativeSwapQuote);
    logger.info(
      `Native amount to swap with contract: ${formattedQuotedNativeAtDestination}`
    );

    await job.updateProgress(60);

    // 4. extract from tx the circle log and from the circle attestation service the signature for that log
    const sourceReceipt = await ctx.providers.evm[
      emitterChain
    ]![0].getTransactionReceipt(ctx.sourceTxHash!);

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
    const swapMessage =
      r.amountToSwap > 0
        ? `Swapping ${r.amountToSwap} USDC for ${r.nativeAssetEstimated} ${r.nativeAssetSymbol}.`
        : "";

    logger.info(
      `Processing ${ethers.utils.formatUnits(
        amount,
        USDC_DECIMALS
      )} USDC sent from ${
        r.senderWallet
      } in ${sourceChainName} to ${recipientWallet} in ${targetChainName}. ${swapMessage}`
    );

    const startedWaitingForWallet = process.hrtime();
    await ctx.wallets.onEVM(toChain, async (w) => {
      const [_, waitedInNanos] = process.hrtime(startedWaitingForWallet);
      r.metrics.waitingForWalletInMs = nanoToMs(waitedInNanos);
      try {
        // redeem parameters for target function call
        const { receipt, waitedForTxInMs } = await this.submitTx(
          ctx,
          targetRelayerAddress,
          w.wallet,
          vaaBytes!,
          circleMessage,
          attestation,
          nativeSwapQuote
        );
        r.evmReceipt = receipt;
        r.metrics.waitingForTxInMs = waitedForTxInMs;
        logger.info(
          `Redeemed source transfer: ${ctx.sourceTxHash} in txhash: ${receipt.transactionHash}`
        );
      } catch (e: any) {
        if (e.error?.reason?.includes("already consumed")) {
          logger.info("Tx failed. This message has already been relayed.");
          return;
        }
        r.errorMessage = e.error?.reason;
        job.attempts >= ctx.storage.job.maxAttempts
          ? r.markFailed(e.error?.reason, 1)
          : r.markRetrying(job.attempts);
        logger.error(
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

    return { receipt, waitedForTxInMs: nanoToMs(waitedForTxInNanos) };
  }
}
