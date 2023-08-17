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
    labelNames: ["chain_name", "strategy"],
    registers: [registry],
  });
}

function registerPriceUpdateFailure(registry: Registry) {
  return new Counter({
    name: "price_update_failure",
    help: "Number of times a contract call has failed to update prices",
    labelNames: ["chain_name", "strategy"],
    registers: [registry],
  });
}

export class PrometheusExporter {
  private priceProviderFailureCounter: Counter;
  private priceUpdateAttemptsCounter: Counter;
  private priceUpdateFailureCounter: Counter;

  private registry: Registry;

  constructor(registry?: Registry) {
    this.registry = registry || new Registry();

    this.priceProviderFailureCounter = registerPriceProviderFailure(
      this.registry
    );
    this.priceUpdateAttemptsCounter = registerPriceUpdateAttempts(
      this.registry
    );
    this.priceUpdateFailureCounter = registerPriceUpdateFailure(this.registry);
  }

  public metrics() {
    return this.registry.metrics();
  }

  public updatePriceProviderFailure(provider: string) {
    this.priceProviderFailureCounter.inc({ provider });
  }

  public updatePriceUpdateAttempts(chainId: string, strategy: string) {
    this.priceUpdateAttemptsCounter.inc({ chain_name: chainId, strategy });
  }

  public updatePriceUpdateFailure(chainId: string, strategy: string) {
    this.priceUpdateFailureCounter.inc({ chain_name: chainId, strategy });
  }
}
