import * as winston from "winston";
import { config } from "./config";

export const localLogger = winston.createLogger({
  transports: [
    new winston.transports.Console({
      level: config.logLevel,
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

export const jsonLogger = winston.createLogger({
  transports: [
    new winston.transports.Console({
      level: config.logLevel,
    }),
  ],
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json(),
    winston.format.errors({ stack: true })
  ),
});

export const rootLogger = config.env === "local" ? localLogger : jsonLogger;
