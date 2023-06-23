import {SupportedChainId} from "./config";

export const RELEASE_CHAIN_ID = Number(process.env.RELEASE_WORMHOLE_CHAIN_ID!) as SupportedChainId;
export const RELEASE_RPC = process.env.RPC!;
export const WALLET_PRIVATE_KEY = process.env.PRIVATE_KEY!;
export const ZERO_BYTES32 =
  "0x0000000000000000000000000000000000000000000000000000000000000000";
