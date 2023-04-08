import { Environment } from "wormhole-relayer";
import { ethers } from "ethers";
import { circleAttestationUrl, SupportedChainId } from "../common/const";
import { sleep } from "wormhole-relayer/lib/utils";
import { Logger } from "winston";
import { CHAIN_ID_ETH } from "@certusone/wormhole-sdk";

const fiveMinutes = 5 * 60 * 1000;

export async function getCircleAttestation(
  env: Environment,
  messageHash: ethers.BytesLike,
  fromChain: SupportedChainId,
  logger: Logger,
  initialTimeout = fromChain === CHAIN_ID_ETH ? 20000 : 8000
) {
  let i = 0;
  let timeout = initialTimeout;
  while (true) {
    timeout = Math.max(900, timeout / 2 ** i++);
    // get the post
    try {
      const res = await fetch(`${circleAttestationUrl[env]}/${messageHash}`, {
        signal: AbortSignal.timeout(800),
      });
      switch (res.status) {
        case 200:
          const body = await res.json();
          if (body.status === "pending_confirmations") {
            logger.debug(
              `waiting for confirmation: ${i}. Sleeping: ${timeout}ms...`
            );
            await sleep(timeout);
            continue;
          } else if (body.status !== "complete") {
            throw new Error(`Body status: ${body.status}`);
          }
          return body.attestation as string;
          break;
        case 404:
          logger.debug(
            `Circle hasn't seen message yet. Sleeping: ${timeout}ms...`
          );
          await sleep(timeout);
          break;
        case 429:
          logger.error("reached rate limit, waiting 2 minutes");
          await sleep(fiveMinutes);
          break;
        default:
          throw new Error(
            `Got unsuccessful response from circle attestation: ${res.status}`
          );
      }
    } catch (e) {
      logger.error(e); // todo log properly
    }

    await sleep(timeout);
  }
}

export async function handleCircleMessageInLogs(
  env: Environment,
  logs: ethers.providers.Log[],
  circleEmitterAddress: string,
  fromChain: SupportedChainId,
  logger: Logger
) {
  const circleMessage = findCircleMessageInLogs(logs, circleEmitterAddress);
  if (circleMessage === null) {
    return { circleMessage: null, signature: null };
  }

  const circleMessageHash = ethers.utils.keccak256(circleMessage);
  const signature = await getCircleAttestation(
    env,
    circleMessageHash,
    fromChain,
    logger
  );

  return { circleMessage, signature };
}

export function findCircleMessageInLogs(
  logs: ethers.providers.Log[],
  circleEmitterAddress: string
): string | null {
  for (const log of logs) {
    if (log.address.toLowerCase() === circleEmitterAddress.toLowerCase()) {
      const messageSentIface = new ethers.utils.Interface([
        "event MessageSent(bytes message)",
      ]);
      return messageSentIface.parseLog(log).args.message as string;
    }
  }

  return null;
}
