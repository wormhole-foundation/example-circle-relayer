import { Counter, Registry } from "prom-client";

function registerPriceProviderFailure(registry: Registry) {
  return new Counter({
    name: "price_provider_failure",
    help: "Number of times the price provider has failed to fetch current prices",
    labelNames: ["provider"],
    registers: [registry],
  });
}

function registerPriceUpdateAttempts(registry: Registry) {
  return new Counter({
    name: "price_update_attempts",
    help: "Number of times a contract call has attempted to update prices",
    labelNames: ["chain_name", "status", "strategy"],
    registers: [registry],
  });
}

export class PrometheusExporter {
  private priceProviderFailureCounter: Counter;
  private priceUpdateAttemptsCounter: Counter;

  private registry: Registry;

  constructor(registry?: Registry) {
    this.registry = registry || new Registry();

    this.priceProviderFailureCounter = registerPriceProviderFailure(
      this.registry
    );
    this.priceUpdateAttemptsCounter = registerPriceUpdateAttempts(
      this.registry
    );
  }

  public metrics() {
    return this.registry.metrics();
  }

  public updatePriceProviderFailure(provider: string) {
    this.priceProviderFailureCounter.inc({ provider });
  }

  public updatePriceUpdateAttempts(params: {
    chainName: string;
    failure: boolean;
    strategy: string;
  }) {
    this.priceUpdateAttemptsCounter.inc({
      chain_name: params.chainName,
      status: params.failure ? "failed" : "success",
      strategy: params.strategy,
    });
  }
}
