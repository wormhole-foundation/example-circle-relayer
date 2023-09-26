import * as winston from "winston";

export const localLogger = (level: string) =>
  winston.createLogger({
    transports: [
      new winston.transports.Console({
        level,
      }),
    ],
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.splat(),
      winston.format.simple(),
      winston.format.timestamp(),
      winston.format.errors({ stack: true })
    ),
  });

export const jsonLogger = (level: string) =>
  winston.createLogger({
    transports: [
      new winston.transports.Console({
        level,
      }),
    ],
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json(),
      winston.format.errors({ stack: true })
    ),
  });

export const getLogger = (env: string, level: string) =>
  env === "local" ? localLogger(level) : jsonLogger(level);
