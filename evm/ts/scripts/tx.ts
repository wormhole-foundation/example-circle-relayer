import type { ethers } from "ethers";

export type Check = (() => Promise<string>);

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

export function handleFailure(
  checks: Check[],
  result: TxResult,
  failureMessage: string
) {
  if (result.txSuccess === false) {
    console.log(failureMessage);
  } else {
    checks.push(() => doCheck(result, result.successMessage, failureMessage));
  }
}

async function doCheck(result: TxResult, successMessage: string, failureMessage: string): Promise<string> {
  const success = await result.check().catch((error) => {
    failureMessage += `\n ${error?.stack || error}`
    return false;
  });
  if (!success) return failureMessage;
  return successMessage;
}
