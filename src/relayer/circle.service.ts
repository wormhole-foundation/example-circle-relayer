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
      if (res !== null && res.status === 200) {
        throw new Error(`Got unsuccessful response: ${res.status}`);
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
