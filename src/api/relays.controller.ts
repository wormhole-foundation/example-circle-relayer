import { Relay } from "../data/relay.model";
import { Context, Next } from "koa";
import { RelayDto } from "./relay.dto";

export class RelayController {
  constructor(private relay: typeof Relay) {}

  search = async (ctx: Context, next: Next) => {
    const txHash = ctx.query.txHash;
    if (!txHash) {
      ctx.status = 400;
      ctx.body = "txHash is required";
      return;
    }
    const relay = await this.relay.findOne({
      where: { fromTxHash: Array.isArray(txHash) ? txHash[0] : txHash },
    });
    if (!relay) {
      ctx.status = 404;
      return;
    }
    const dto = relayDocumentToApiResponse(relay);
    ctx.body = {
      data: dto,
    };
  };
}

const relayDocumentToApiResponse = (relay: Relay) => new RelayDto(relay);
