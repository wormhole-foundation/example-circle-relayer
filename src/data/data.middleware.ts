import { Next } from "koa";
import { Relay, RelayStatus } from "./relay.model.js";
import {
  fetchVaaHash,
  RelayerApp,
  RelayerEvents,
  RelayJob,
  SourceTxContext,
  StorageContext,
  ParsedVaaWithBytes,
} from "@wormhole-foundation/relayer-engine";
import { Logger } from "winston";
import { CctpRelayerContext } from "../relayer/index.js";

export interface DataContext extends StorageContext, SourceTxContext {
  relay: Relay;
}

export function storeRelays(
  app: RelayerApp<CctpRelayerContext>,
  logger: Logger
) {
  app.on(
    RelayerEvents.Added,
    async (vaa: ParsedVaaWithBytes, job?: RelayJob) => {
      const { emitterChain, emitterAddress, sequence } = vaa.id;

      let relay = await Relay.findOne({
        where: { emitterChain, emitterAddress, sequence },
      });

      if (!relay) {
        const txHash = await fetchVaaHash(
          emitterChain,
          vaa.emitterAddress,
          vaa.sequence,
          logger,
          app.env,
          3
        );
        relay = new Relay({
          emitterChain: emitterChain,
          emitterAddress: emitterAddress,
          sequence: sequence,
          vaa: vaa.bytes,
          status: RelayStatus.WAITING,
          receivedAt: new Date(),
          fromTxHash: txHash,
          attempts: 0,
          maxAttempts: job?.maxAttempts,
          metrics: {
            waitingForTxInMs: 0,
            waitingForWalletInMs: 0,
          },
        });
        try {
          return await relay.save();
        } catch (e: any) {
          if (e.code !== 11000) {
            logger.error(`Error saving added relay`, e);
          }
        }
      }
    }
  );

  return async function storeRelaysMiddleware(ctx: DataContext, next: Next) {
    const vaa = ctx.vaa!;
    const { emitterChain, emitterAddress, sequence } = vaa.id;

    let relay = await Relay.findOne({
      where: { emitterChain, emitterAddress, sequence },
    });
    const job = ctx.storage.job;
    if (!relay) {
      relay = new Relay({
        emitterChain: emitterChain,
        emitterAddress: emitterAddress,
        sequence: sequence,
        vaa: vaa.bytes,
        status: RelayStatus.ACTIVE,
        fromTxHash: ctx.sourceTxHash,
        attempts: job?.attempts,
        maxAttempts: job?.maxAttempts,
        receivedAt: new Date(),
        metrics: {
          waitingForTxInMs: 0,
          waitingForWalletInMs: 0,
        },
      });
      try {
        relay = await relay.save();
      } catch (e: any) {
        if (e.code !== 11000) {
          throw e;
        }
        relay = await Relay.findOne({
          where: { emitterChain, emitterAddress, sequence },
        });
      }
    }

    try {
      relay!.attempts = job.attempts;
      ctx.relay = relay!;
      await next();
    } catch (e: any) {
      if (job.attempts >= job.maxAttempts) {
        relay!.markFailed(e.message, e.code);
      } else {
        relay!.markRetrying(relay!.attempts);
      }
      throw e;
    } finally {
      await relay!.save();
    }
  };
}
