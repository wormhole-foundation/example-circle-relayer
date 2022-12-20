import {tryNativeToHexString} from "@certusone/wormhole-sdk";
import {MockEmitter} from "@certusone/wormhole-sdk/lib/cjs/mock";
import {ethers} from "ethers";
import {ICircleIntegration} from "../../src";

export interface Transfer {
  token: string;
  amount: ethers.BigNumber;
  targetChain: number;
  mintRecipient: Buffer;
}

export interface MockDepositWithPayload {
  nonce: number;
  fromAddress: Buffer;
}

export class MockCircleIntegration extends MockEmitter {
  domain: number;
  foreignCircleIntegration: ICircleIntegration;

  constructor(
    address: string,
    chain: number,
    domain: number,
    foreignCircleIntegration: ICircleIntegration
  ) {
    super(tryNativeToHexString(address, "ethereum"), chain);
    this.domain = domain;
    this.foreignCircleIntegration = foreignCircleIntegration;
  }
}
