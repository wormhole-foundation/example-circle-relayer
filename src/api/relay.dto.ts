import { ChainId, coalesceChainName } from "@certusone/wormhole-sdk";
import { Relay } from "../data/relay.model.js";

export class RelayDto {
  from: {
    chain: string; // "ethereum"
    chainId: ChainId;
    senderAddress: string;
    txHash: string;
    amountSent: number;
    amountToSwap: number;
    estimatedNativeAssetAmount: number;
    symbol: string;
  };
  vaa: any;
  status: string;
  fee: {
    amount: number;
    symbol: string;
  };
  error: {
    message: string;
    code: number | undefined;
  } | null;
  to: {
    chain: string;
    chainId: ChainId;
    txHash: string;
    gasUsed: number;
    recipientAddress: string;
    nativeAssetSymbol: string; // "SOL"
    nativeAssetReceived: number; // "0.000000001"
  };
  metrics: {
    receivedAt?: Date;
    completedAt?: Date;
    failedAt?: Date;
    attempts: number;
    maxAttempts: number;
    waitingForTxInMs: number;
    waitingForWalletInMs: number;
  };

  constructor(relay: Relay) {
    this.from = {
      chain: coalesceChainName(relay.fromChain),
      chainId: relay.fromChain,
      txHash: relay.fromTxHash,
      senderAddress: relay.senderWallet,
      symbol: relay.symbol,
      amountSent: relay.amountTransferred,
      amountToSwap: relay.amountToSwap,
      estimatedNativeAssetAmount: relay.nativeAssetEstimated,
    };
    this.vaa = relay.vaa.toString("base64");
    this.status = relay.status;
    this.fee = { amount: relay.feeAmount, symbol: relay.symbol };
    this.error = relay.errorMessage
      ? {
          message: relay.errorMessage,
          code: relay.errorCode,
        }
      : null;
    this.to = {
      chain: coalesceChainName(relay.toChain),
      chainId: relay.toChain,
      recipientAddress: relay.recipientWallet,
      txHash: relay.toTxHash,
      gasUsed: relay.gasUsed,
      nativeAssetSymbol: relay.nativeAssetSymbol,
      nativeAssetReceived: relay.nativeAssetReceived,
    };
    this.metrics = {
      receivedAt: relay.receivedAt,
      completedAt: relay.completedAt,
      failedAt: relay.failedAt,
      attempts: relay.attempts,
      maxAttempts: relay.maxAttempts,
      waitingForTxInMs: relay.metrics.waitingForTxInMs,
      waitingForWalletInMs: relay.metrics.waitingForWalletInMs,
    };
  }
}
