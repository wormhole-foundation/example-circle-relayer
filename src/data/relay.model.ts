import {
  BaseEntity,
  Column,
  Entity,
  Index,
  ObjectId,
  ObjectIdColumn,
} from "typeorm";
import {
  CHAIN_ID_ACALA,
  CHAIN_ID_ALGORAND,
  CHAIN_ID_AVAX,
  CHAIN_ID_BSC,
  CHAIN_ID_CELO,
  CHAIN_ID_ETH,
  CHAIN_ID_FANTOM,
  CHAIN_ID_GNOSIS,
  CHAIN_ID_INJECTIVE,
  CHAIN_ID_KARURA,
  CHAIN_ID_KLAYTN,
  CHAIN_ID_MOONBEAM,
  CHAIN_ID_NEAR,
  CHAIN_ID_POLYGON,
  CHAIN_ID_SOLANA,
  CHAIN_ID_SUI,
  CHAIN_ID_TERRA,
  CHAIN_ID_UNSET,
  ChainId,
  SignedVaa,
} from "@certusone/wormhole-sdk";
import { RelayPoint } from "./relay.metrics";
import { ethers } from "ethers";
import { formatEther } from "ethers/lib/utils";

export enum RelayStatus {
  REDEEMED = "redeemed",
  FAILED = "failed",
  WAITING = "waiting",
  ACTIVE = "inprogress",
}

const chainToNativeSymbol: Partial<Record<ChainId, string>> = {
  [CHAIN_ID_SOLANA]: "SOL",
  [CHAIN_ID_ETH]: "ETH",
  [CHAIN_ID_AVAX]: "AVAX",
  [CHAIN_ID_BSC]: "BNB",
  [CHAIN_ID_FANTOM]: "FTM",
  [CHAIN_ID_POLYGON]: "MATIC",
  [CHAIN_ID_CELO]: "CELO",
  [CHAIN_ID_ALGORAND]: "ALGO",
  [CHAIN_ID_ACALA]: "ACA",
  [CHAIN_ID_INJECTIVE]: "INJ",
  [CHAIN_ID_GNOSIS]: "GNO",
  [CHAIN_ID_MOONBEAM]: "GLMR",
  [CHAIN_ID_KLAYTN]: "KLAY",
  [CHAIN_ID_KARURA]: "KAR",
  [CHAIN_ID_TERRA]: "LUNA",
  [CHAIN_ID_SUI]: "SUI",
  [CHAIN_ID_NEAR]: "NEAR",
};

class RelayMetrics {
  @Column()
  waitingForWalletInMs: number = 0;

  @Column()
  waitingForTxInMs: number = 0;
}

@Entity()
@Index(["emitterChain", "emitterAddress", "sequence"], { unique: true })
export class Relay extends BaseEntity {
  constructor(props?: Partial<Relay>) {
    super();
    if (props) {
      Object.assign(this, props);
    }
  }

  @ObjectIdColumn()
  _id?: ObjectId;

  @Column()
  emitterChain: ChainId = CHAIN_ID_UNSET;

  @Column()
  emitterAddress: string = "";

  @Column()
  senderWallet: string = "";

  @Column()
  recipientWallet: string = "";

  @Column()
  sequence: string = "";

  @Column()
  status: RelayStatus = RelayStatus.WAITING;

  @Column()
  @Index()
  fromTxHash: string = "";

  @Column()
  toTxHash: string = "";

  @Column()
  symbol: string = "";

  @Column()
  amountTransferred: number = 0;

  @Column()
  amountToSwap: number = 0;

  @Column()
  nativeAssetEstimated: number = 0;

  @Column()
  nativeAssetReceived: number = 0;

  @Column()
  feeAmount: number = 0;

  @Column()
  errorMessage?: string;

  @Column()
  errorCode?: number;

  @Column()
  gasUsed: number = 0;

  @Column()
  attempts: number = 0;

  @Column()
  maxAttempts: number = 0;

  @Column()
  gasPrice: number = 0;

  @Column()
  relayCost: number = 0;

  @Column()
  metrics: RelayMetrics = new RelayMetrics();

  @Column()
  vaa: SignedVaa = new Uint8Array();

  @Column()
  receivedAt?: Date;

  @Column()
  completedAt?: Date;

  @Column()
  failedAt?: Date;

  get fromChain() {
    return this.emitterChain;
  }

  @Column()
  toChain: ChainId = CHAIN_ID_UNSET;

  set evmReceipt(receipt: ethers.ContractReceipt) {
    this.markRedeemed(receipt.transactionHash);
    this.gasUsed = receipt.gasUsed.toNumber();
    this.gasPrice = Number(formatEther(receipt.effectiveGasPrice));
    this.relayCost = Number(this.gasUsed) * Number(this.gasPrice);
  }

  get nativeAssetSymbol(): string {
    return this.toChain ? chainToNativeSymbol[this.toChain] ?? "" : "";
  }

  markRedeemed(txHash: string) {
    this.errorMessage = undefined;
    this.errorCode = undefined;
    this.status = RelayStatus.REDEEMED;
    this.toTxHash = txHash;
    this.completedAt = new Date();
  }

  markRetrying(attempts: number) {
    this.status = RelayStatus.WAITING;
    this.attempts = attempts;
  }

  markFailed(errorMessage: string, errorCode: number) {
    this.status = RelayStatus.FAILED;
    this.failedAt = new Date();
    this.errorMessage = errorMessage;
    this.errorCode = errorCode;
  }

  get point(): RelayPoint {
    const p = new RelayPoint(this.fromChain, this.toChain, this.symbol);
    p.amountToSwap = this.amountToSwap;
    p.amountTransferred = this.amountTransferred;
    p.nativeAssetEstimated = this.nativeAssetEstimated;
    p.nativeAssetReceived = this.nativeAssetReceived;
    p.status = this.status;
    p.feeAmount = this.feeAmount;
    p.gasPrice = this.gasPrice;
    p.gasUsed = this.gasUsed;
    p.attempts = this.attempts;
    p.recipient = this.recipientWallet;
    p.asset = this.symbol;
    if (this.errorMessage) {
      p.reason = this.errorMessage;
    }
    p.txHash = this.toTxHash;
    return p;
  }
}
