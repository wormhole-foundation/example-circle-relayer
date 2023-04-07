import { Point } from "@influxdata/influxdb-client";
import { ChainId, coalesceChainName } from "@certusone/wormhole-sdk";

/**
 * Example of metrics collected:
 * A user wants to transfer 100 USDC (`amountTransferred`) to another chain, out of those 100 USDC, they want to conver 10 USDC to native gas (`swapAmountToken`).
 * The relayer will do this for a of 1 USDC (`feeAmount`), and will use the pricing data for USDC to native asset in eg. Polygon, to transform 10 USDC into 0.1 MATIC (quotedSwapAmountNative)
 * It will then send this to the relayer contract that will execute the swap and it may have changed from what the offchain component quoted. Say it's not 0.09 MATIC (executedSwapAmountNative)
 *
 * To make the units smaller we will need the token decimals and native asset decimals (we want to log that we sent 1 ETH not 1000000000000000000 wei, same for ERC20 tokens)
 * For the amountTransferred with need to denormalize and use the erc20 token decimals.
 * For swapAmountToken also need to divide by the token decimals (ethers.utils.parseUnits(swapAmountToken, tokenDecimals))
 * For quotedSwapAmountNative we need to do parseUnits with the native decimals. Same goes for executedSwapAmountNative.
 * For fee amount we first need to denormalize then parseUnits using the token decimals
 */
export class RelayPoint extends Point {
  private _status?: string;
  private _amountTransferred?: number;
  private _swapAmountToken?: number;
  private _executedSwapAmountNative = 0;
  private _quotedSwapAmountNative = 0;
  private _feeAmount?: number;
  private _address?: string;
  private _gasUsed = 0;
  private _gasPrice = 0;
  private _relayCost = 0;
  constructor(
    public fromChain: ChainId,
    public toChain: ChainId,
    public sequence: bigint | string
  ) {
    super("relays");
    this.tag("fromChain", coalesceChainName(fromChain))
      .tag("toChain", coalesceChainName(toChain))
      .tag("asset", "USDC")
      .stringField("sequence", sequence.toString());

    this.swapAmountToken = 0;
    this.executedSwapAmountNative = 0;
    this.quotedSwapAmountNative = 0;
  }

  set status(status: string) {
    this._status = status;
    this.tag("status", status); //redeemed, failed
  }

  redeemed(txHash?: string) {
    this.status = "redeemed";
    if (txHash) {
      this.txHash = txHash;
    }
  }

  failed(reason?: string) {
    this.status = "failed";
    if (reason) {
      this.reason = reason;
    }
  }

  set amountTransferred(amountTransferred: number | string) {
    this._amountTransferred = Number(amountTransferred);
    this.floatField("amountTransferred", this._amountTransferred); // how much native asset you're getting on the target chain
  }

  set gasUsed(gasUsed: number | string) {
    this._gasUsed = Number(gasUsed);
    this.floatField("gasUsed", this._gasUsed); // How much gas was spent on the tx
  }

  set gasPrice(gasPrice: number | string) {
    this._gasPrice = Number(gasPrice);
    this.floatField("gasPrice", this._gasPrice); // how much we paid per unit of gas
    if (this._gasUsed) {
      this._relayCost = this._gasUsed * this._gasPrice;
      this.floatField("relayCost", this._relayCost); // how much did relaying cost in native asset
    }
  }

  get gasPrice() {
    return this._gasPrice;
  }

  get gasUsed() {
    return this._gasUsed;
  }

  get relayCost() {
    return this._relayCost;
  }

  set swapAmountToken(swapAmountToken: number | string) {
    this._swapAmountToken = Number(swapAmountToken);
    this.floatField("swapAmountToken", this._swapAmountToken); // how much native asset you're getting on the target chain
  }

  set executedSwapAmountNative(executedSwapAmountNative: number | string) {
    this._executedSwapAmountNative = Number(executedSwapAmountNative);
    this.floatField("executedSwapAmountNative", this._executedSwapAmountNative); // how much native asset you're getting on the target chain
  }

  get executedSwapAmountNative() {
    return this._executedSwapAmountNative;
  }

  set quotedSwapAmountNative(quotedSwapAmountNative: number | string) {
    this._quotedSwapAmountNative = Number(quotedSwapAmountNative);
    this.floatField("quotedSwapAmountNative", this._quotedSwapAmountNative); // how much native asset you're getting on the target chain
  }

  set feeAmount(feeAmount: number | string) {
    this._feeAmount = Number(feeAmount);
    this.floatField("feeAmount", this._feeAmount); // how much native asset you're getting on the target chain
  }

  set recipient(address: string) {
    this._address = address;
    this.stringField("recipient", this._address); // how much native asset you're getting on the target chain
  }

  set txHash(txHash: string) {
    this.stringField("txHash", txHash);
  }

  set reason(reason: string) {
    this.stringField("reason", reason);
  }

  set asset(asset: string) {
    this.tag("asset", asset);
  }

  set attempts(attempts: number) {
    this.intField("attempts", attempts);
  }
}
