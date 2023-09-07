import {
  MetricLabelsOpts,
  MetricsOpts,
  metrics,
} from "@wormhole-foundation/relayer-engine";
import { Registry } from "prom-client";
import { coalesceChainName } from "@certusone/wormhole-sdk";
import { CctpRelayerContext } from "./index";
import { MetricsMiddlewareConfig } from "./config";

const DEFAULT_BUCKETS = [
  10000, // 10s
  20000, // 20s
  30000, // 30s
  60000, // 60s
  240000, // 4m
  600000, // 10m
  1200000, // 20m
  3600000, // 1h
];

const metricsOpts = (registry: Registry, config?: MetricsMiddlewareConfig): MetricsOpts<CctpRelayerContext> => {
  async function labelsCustomizer(
    ctx: CctpRelayerContext
  ): Promise<Record<string, string | number>> {
    return {
      targetChain: coalesceChainName(ctx.relay.toChain),
    };
  }

  const labelOpts = new MetricLabelsOpts<CctpRelayerContext>(
    ["targetChain"],
    labelsCustomizer
  );

  return {
    registry,
    labels: labelOpts,
    buckets: {
      processing: config?.processingDurationBuckets ?? DEFAULT_BUCKETS,
      total: config?.totalDurationBuckets ?? DEFAULT_BUCKETS,
      relay: config?.relayDurationBuckets ?? DEFAULT_BUCKETS,
    }
  };
};

export function metricsMiddleware(registry: Registry, config?: MetricsMiddlewareConfig) {
  return metrics(metricsOpts(registry, config));
}