import { ethers } from "ethers";
import { SupportedChainId } from "./config";

export type Check = () => Promise<string>;

export class TxResult {
  private constructor(
    public readonly txSuccess: boolean,
    public readonly successMessage: string,
    public readonly check: () => Promise<boolean>
  ) {}

  static create(
    txReceipt: ethers.ContractReceipt,
    successMessage: string,
    check: () => Promise<boolean>
  ) {
    return new TxResult(txReceipt.status === 1, successMessage, check);
  }

  static Success(successMessage: string) {
    return new TxResult(true, successMessage, async () => true);
  }
}

export function handleFailure(checks: Check[], result: TxResult, failureMessage: string) {
  if (result.txSuccess === false) {
    console.log(failureMessage);
  } else {
    checks.push(() => doCheck(result, result.successMessage, failureMessage));
  }
}

async function doCheck(
  result: TxResult,
  successMessage: string,
  failureMessage: string
): Promise<string> {
  const success = await result.check().catch((error) => {
    failureMessage += `\n ${error?.stack || error}`;
    return false;
  });
  if (!success) return failureMessage;
  return successMessage;
}

export function buildOverrides(
  chainId: SupportedChainId
): ethers.Overrides {
  const overrides: ethers.Overrides = {};
  if (chainId === 23) {
    // Arbitrum gas price feeds are excessive on public endpoints too apparently.
    overrides.type = 2;
    overrides.maxFeePerGas = ethers.utils.parseUnits("0.2", "gwei");
    overrides.maxPriorityFeePerGas = 0;
  }
  return overrides;
}
