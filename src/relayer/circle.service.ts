import { Environment } from "wormhole-relayer";
import { ethers } from "ethers";
import { circleAttestationUrl } from "./const";
import { sleep } from "wormhole-relayer/lib/utils";

export async function getCircleAttestation(
  env: Environment,
  messageHash: ethers.BytesLike,
  timeout: number = 2000
) {
  while (true) {
    // get the post
    try {
      const res = await fetch(`${circleAttestationUrl[env]}/${messageHash}`);
      if (res !== null && res.status !== 200) {
        throw new Error(
          `Got unsuccessful response from circle attestation: ${res.status}`
        );
      }
      const body = await res.json();
      if (body.status !== "complete") {
        throw new Error(`Body status: ${body.status}`);
      }

      return body.attestation as string;
    } catch (e) {
      console.log(e); // todo log properly
    }

    await sleep(timeout);
  }
}

export async function handleCircleMessageInLogs(
  env: Environment,
  logs: ethers.providers.Log[],
  circleEmitterAddress: string
) {
  const circleMessage = findCircleMessageInLogs(logs, circleEmitterAddress);
  if (circleMessage === null) {
    return { circleMessage: null, signature: null };
  }

  const circleMessageHash = ethers.utils.keccak256(circleMessage);
  const signature = await getCircleAttestation(env, circleMessageHash);

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
