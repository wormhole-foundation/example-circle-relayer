import { BigNumber, Contract, ethers } from "ethers";
import { Logger } from "winston";
import {
  CIRCLE_DOMAIN_TO_WORMHOLE_CHAIN,
  SupportedChainId,
} from "../common/const";
import { tryUint8ArrayToNative } from "@certusone/wormhole-sdk";

export function relayerContract(
  address: string,
  signer: ethers.Signer | ethers.providers.Provider
): ethers.Contract {
  const contract = new Contract(
    address,
    [
      "function redeemTokens((bytes,bytes,bytes)) payable",
      "function calculateNativeSwapAmountOut(address,uint256) view returns (uint256)",
      "function nativeSwapRate(address) public view returns (uint256)",
      "function updateNativeSwapRate(uint16,address,uint256) public",
      "function nativeSwapRatePrecision() public view returns (uint256)",
    ],
    signer
  );

  return contract;
}

export function integrationContract(
  address: string,
  signer: ethers.providers.Provider
): ethers.Contract {
  const contract = new Contract(
    address,
    ["function fetchLocalTokenAddress(uint32,bytes32) view returns (bytes32)"],
    signer
  );

  return contract;
}

export interface CircleVaaPayload {
  version: number;
  token: string;
  amount: BigNumber;
  feeAmount: BigNumber;
  nonce: string;
  fromDomain: number;
  mintRecipient: string;
  nativeSourceTokenAddress: Buffer;
  toNativeAmount: BigNumber;
  fromChain: SupportedChainId;
  toDomain: number;
  toChain: SupportedChainId;
  recipientWallet: string;
}

export function parseVaaPayload(
  payloadArray: Buffer,
  logger: Logger
): CircleVaaPayload {
  // start vaa payload
  let offset = 0;
  const version = payloadArray.readUint8(offset);
  offset += 1; // 1
  const nativeSourceTokenAddress = payloadArray.subarray(offset, offset + 32);
  offset += 32; // 33
  const amountBuff = payloadArray.subarray(offset, offset + 32);
  offset += 32; // 65
  const fromDomain = payloadArray.readUInt32BE(offset);
  offset += 4; // 69
  const toDomain = payloadArray.readUInt32BE(offset);
  offset += 4; // 73
  const nonce = payloadArray.readBigUint64BE(offset).toString();
  offset += 8; // 81
  const fromAddress = payloadArray.subarray(offset, offset + 32);
  offset += 32; // 113
  const mintRecipientBuff = payloadArray.subarray(offset, offset + 32);
  offset += 32; // 145

  offset += 2; // 147 (2 bytes for payload length)
  // end vaa payload

  // start relayer payload
  const relayerPayloadId = payloadArray.readUint8(offset);
  offset += 1; // 148
  const feeAmount = ethers.BigNumber.from(
    payloadArray.subarray(offset, offset + 32)
  );
  offset += 32; // 180
  const toNativeAmount = ethers.BigNumber.from(
    payloadArray.subarray(offset, offset + 32)
  );
  offset += 32; // 212
  const recipientWalletBuff = payloadArray.subarray(offset, offset + 32);
  offset += 32; // 244

  if (!(fromDomain in CIRCLE_DOMAIN_TO_WORMHOLE_CHAIN)) {
    logger.warn(`Unknown fromDomain: ${fromDomain}.`);
    throw new Error("Invalid circle source domain");
  }

  if (!(toDomain in CIRCLE_DOMAIN_TO_WORMHOLE_CHAIN)) {
    logger.warn(`Unknown toDomain: ${toDomain}. Skipping...`);
    throw new Error("Invalid circle target domain");
  }

  // cache toChain ID
  const fromChain = CIRCLE_DOMAIN_TO_WORMHOLE_CHAIN[fromDomain];
  const toChain = CIRCLE_DOMAIN_TO_WORMHOLE_CHAIN[toDomain];
  const mintRecipient = tryUint8ArrayToNative(mintRecipientBuff, toChain);
  const token = tryUint8ArrayToNative(nativeSourceTokenAddress, fromChain);
  const amount = ethers.BigNumber.from(amountBuff);
  const recipientWallet = tryUint8ArrayToNative(recipientWalletBuff, toChain);

  return {
    version,
    token,
    amount,
    nonce,
    fromDomain,
    fromChain,
    toDomain,
    toChain,
    nativeSourceTokenAddress,
    mintRecipient,
    toNativeAmount,
    feeAmount,
    recipientWallet,
  };
}
