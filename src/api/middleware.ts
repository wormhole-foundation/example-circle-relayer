import { Context, Next } from "koa";
import { Logger } from "winston";

export const loggerMiddleware = (logger: Logger) => {
  return async (ctx: Context, next: Next) => {
    if (ctx.url.endsWith("/health")) {
      await next();
      return;
    }
    logger.debug(`${ctx.method} ${ctx.url}`);
    const start = process.hrtime();
    await next();
    const [_, inNanos] = process.hrtime(start);
    const duration = inNanos / 1e6;
    logger.debug(`${ctx.method} ${ctx.url} ${ctx.status} ${duration}ms`, {
      method: ctx.method,
      url: ctx.url,
      duration,
      status: ctx.status,
    });
  };
};

export const healthMiddleware = async (ctx: Context) => {
  ctx.body = "ok";
};
