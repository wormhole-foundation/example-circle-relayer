import { Contract, ethers } from "ethers";
import { Logger } from "winston";
import { CIRCLE_DOMAIN_TO_WORMHOLE_CHAIN, SupportedChainId } from "./const";
import { tryUint8ArrayToNative } from "@certusone/wormhole-sdk";

export function relayerContract(
  address: string,
  signer: ethers.Signer
): ethers.Contract {
  const contract = new Contract(
    address,
    [
      "function redeemTokens((bytes,bytes,bytes)) payable",
      "function calculateNativeSwapAmountOut(address,uint256) view returns (uint256)",
    ],
    signer
  );

  return contract;
}

export function integrationContract(
  address: string,
  signer: ethers.Signer
): ethers.Contract {
  const contract = new Contract(
    address,
    ["function fetchLocalTokenAddress(uint32,bytes32) view returns (bytes32)"],
    signer
  );

  return contract;
}

export interface CircleVaaPayload {
  fromDomain: number;
  mintRecipient: string;
  nativeSourceTokenAddress: Buffer;
  toNativeAmount: string;
  fromChain: SupportedChainId;
  toDomain: number;
  toChain: SupportedChainId;
}

export function parseVaaPayload(
  payloadArray: Buffer,
  logger: Logger
): CircleVaaPayload {
  const fromDomain = payloadArray.readUInt32BE(65);
  const toDomain = payloadArray.readUInt32BE(69);

  if (!(fromDomain in CIRCLE_DOMAIN_TO_WORMHOLE_CHAIN)) {
    logger.warn(`Unknown fromDomain: ${fromDomain}. skipping...`);
  }

  if (!(toDomain in CIRCLE_DOMAIN_TO_WORMHOLE_CHAIN)) {
    logger.warn(`Unknown toDomain: ${toDomain}. Skipping...`);
    throw new Error("Invalid Circle Domain");
  }

  const nativeSourceTokenAddress = payloadArray.subarray(1, 33);

  // cache toChain ID
  const fromChain = CIRCLE_DOMAIN_TO_WORMHOLE_CHAIN[fromDomain];
  const toChain = CIRCLE_DOMAIN_TO_WORMHOLE_CHAIN[toDomain];
  const mintRecipient = tryUint8ArrayToNative(
    payloadArray.subarray(81, 113),
    toChain
  );
  const toNativeAmount = ethers.utils.hexlify(payloadArray.subarray(180, 212));

  return {
    fromDomain,
    fromChain,
    toDomain,
    toChain,
    nativeSourceTokenAddress,
    mintRecipient,
    toNativeAmount,
  };
}
