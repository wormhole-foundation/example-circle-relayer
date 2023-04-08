import { Environment, Next, StandardRelayerContext } from "wormhole-relayer";
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
  CIRCLE_EMITTER_ADDRESSES,
  SupportedChainId,
  USDC_RELAYER_ADDRESSES,
  USDC_WH_SENDER,
} from "../common/const";
import {
  coalesceChainName,
  tryUint8ArrayToNative,
  uint8ArrayToHex,
} from "@certusone/wormhole-sdk";
import { RelayPoint } from "./relay-point.metrics";
import { handleCircleMessageInLogs } from "./circle.service";

export class RelayerService {
  private readonly circleAddresses: Addresses;
  private readonly usdcRelayerAddresses: Addresses;
  private readonly usdcWhSenderAddresses: Addresses;

  constructor(public env: Environment, private writeApi?: WriteApi) {
    this.circleAddresses = CIRCLE_EMITTER_ADDRESSES[env];
    this.usdcRelayerAddresses = USDC_RELAYER_ADDRESSES[env];
    this.usdcWhSenderAddresses = USDC_WH_SENDER[env];
  }

  handleVaa = async (ctx: StandardRelayerContext, next: Next) => {
    const { vaaBytes, logger, vaa } = ctx;
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

    let payload: CircleVaaPayload;

    try {
      payload = parseVaaPayload(vaa.payload, logger);
    } catch (e) {
      logger.error("Skipping Circle VAA", e);
      return;
    }

    const {
      fromChain,
      toChain,
      nativeSourceTokenAddress,
      mintRecipient,
      toNativeAmount,
      fromDomain,
    } = payload;

    if (
      ethers.utils.getAddress(mintRecipient) !==
      ethers.utils.getAddress(this.usdcRelayerAddresses[fromChain]!)
    ) {
      logger.warn(
        `Unknown mintRecipient: ${mintRecipient} for chainId: ${toChain}, terminating relay`
      );
      return;
    }

    const sourceChainName = coalesceChainName(fromChain);
    const targetChainName = coalesceChainName(toChain);

    logger.info(
      `Processing transaction from ${sourceChainName} to ${targetChainName}`
    );

    const p = new RelayPoint(fromChain, toChain, vaa.sequence);

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
    logger.info(
      `Native amount to swap with contract: ${ethers.utils.formatEther(
        nativeSwapQuote
      )}`
    );

    await job.updateProgress(60);

    const targetRelayerAddress = this.usdcRelayerAddresses[toChain]!;

    // 4. extract from tx the circle log and from the circle attestation service the signature for that log
    const receipt = await ctx.providers.evm[
      fromChain
    ]![0].getTransactionReceipt(ctx.sourceTxHash);

    logger.debug("Fetching Circle attestation");
    const { circleMessage, signature } = await handleCircleMessageInLogs(
      this.env,
      receipt.logs,
      this.circleAddresses[fromChain]!,
      fromChain,
      logger
    );
    if (circleMessage === null || signature === null) {
      throw new Error(`Error parsing receipt, txhash: ${ctx.sourceTxHash}`);
    }

    job.updateProgress(70);
    await ctx.wallets.onEVM(toChain, async (walletToolBox) => {
      try {
        // redeem parameters for target function call
        const redeemParameters = [
          `0x${uint8ArrayToHex(vaaBytes)}`,
          circleMessage,
          signature,
        ];

        const receipt = await this.submitTx(
          ctx,
          targetRelayerAddress,
          walletToolBox.wallet,
          redeemParameters,
          nativeSwapQuote
        );
        p.redeemed(receipt.transactionHash);
      } catch (e: any) {
        if (e.error?.reason?.includes("already consumed")) {
          logger.info("Tx failed. This message has already been relayed.");
          return;
        }
        p.reason = e.error?.reason;
        p.status =
          job.attemptsMade >= ctx.storage.maxAttempts ? "failed" : "retrying";
        job.log(
          `Error posting tx: ${e.error?.reason}. ${e.error?.code}. ${e.message}.`
        );
        throw e;
      } finally {
        if (p.status !== "retrying") {
          // avoid pushing to influx if we're still retrying
          p.attempts = job.attemptsMade;
          this.writeApi?.writePoint(p);
        }
      }
    });
  };

  async submitTx(
    ctx: StandardRelayerContext,
    targetRelayerAddress: string,
    wallet: ethers.Wallet,
    redeemParameters: string[],
    nativeSwapQuote: ethers.BigNumber
  ) {
    const { logger, storage } = ctx;
    const job = storage.job;
    const contract = relayerContract(targetRelayerAddress, wallet);

    // 5. redeem the transfer on the target chain
    const tx: ethers.ContractTransaction = await contract.redeemTokens(
      redeemParameters,
      {
        value: nativeSwapQuote,
      }
    );

    job.updateProgress(90);
    const redeedReceipt: ethers.ContractReceipt = await tx.wait();

    logger.info(
      `Redeemed transfer in txhash: ${redeedReceipt.transactionHash}`
    );
    return redeedReceipt;
  }
}
