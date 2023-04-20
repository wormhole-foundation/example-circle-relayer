# WH x CCTP USDC Bridge Example

Please start by reading the [design document](https://github.com/wormhole-foundation/example-circle-relayer/blob/main/DESIGN.md).

## Wormhole-Scaffolding

This repository was generated from the [wormhole-scaffolding](https://github.com/wormhole-foundation/wormhole-scaffolding) template. We recommend using this template as a starting point for cross-chain development on Wormhole.

## Prerequisites

Install [Foundry tools](https://book.getfoundry.sh/getting-started/installation), which include `forge`, `anvil` and `cast` CLI tools.

## Build

Run the following commands to install necessary dependencies and to build the smart contracts:

```
cd evm
make dependencies
make build
```

## Testing Environment

The testing environments can be found in the following locations:

- [Unit Tests](https://github.com/wormhole-foundation/example-circle-relayer/blob/main/evm/forge-test/CircleRelayer.t.sol)
- [Integration Tests](https://github.com/wormhole-foundation/example-circle-relayer/tree/main/evm/ts-test)

First, set the `RPC` variable in `evm/env/testing.env`. Then run the tests with the following commands:

```
# solidity-based unit tests
make unit-test

# local-validator integration tests written in typescript
make integration-test

# unit tests and local-validator integration tests
make test
```

## Contract Deployment

Before deploying the contracts, set the `Deployment Variables` and `RPC` in the following environment files:

- `evm/env/avax-fuji-testnet.env`
- `evm/env/eth-goerli-testnet.env`

Then deploy the contracts by executing the following commands:

```

# goerli
. env/eth-goerli-testnet.env && PRIVATE_KEY=put_your_private_key_here bash shell-scripts/deploy_circle_relayer.sh

# fuji
. env/avax-fuji-testnet.env && PRIVATE_KEY=put_your_private_key_here bash shell-scripts/deploy_circle_relayer.sh

```

Make sure to deploy all contracts (save the contract addresses) before moving onto the `Initial Contract Setup` section of this README.md.

## Initial Contract Setup

After deploying the contracts set the `Initial Setup Variables` in the following files:

- `evm/env/avax-fuji-testnet.env`
- `evm/env/eth-goerli-testnet.env`

Then perform the initial contract setup by executing the following commands:

```
# goerli
. env/eth-goerli-testnet.env && PRIVATE_KEY=put_your_private_key_here bash shell-scripts/setup_circle_relayer.sh

# fuji
. env/avax-fuji-testnet.env && PRIVATE_KEY=put_your_private_key_here bash shell-scripts/setup_circle_relayer.sh
```

## Off-Chain Circle Relayer

Copy the sample `.env` file in the `relayer` directory and set the values:

```
cp .env.sample .env
```

To run the off-chain relayer process, check that the contract addresses are correct in the `relayer/src/circleRelayer/main.ts` file, then run the following commands:

```
cd relayer
npm ci
npm run build
npm run start-circle-relayer
```

## Off-Chain Price Relayer

Copy the sample `.env` file in the `relayer` directory and set the values (this .env file is shared with the Off-Chain Circle Relayer process):

```
cp .env.sample .env
```

Copy the `priceRelayerSample.json` file in the `relayer/cfg` directory and set the values:

```
cp priceRelayerSample.json priceRelayer.json
```

To run the off-chain relayer process, check that the contract addresses are correct in the `relayer/src/priceRelayer/main.ts` file, then run the following commands:

```
# only run these if you haven't already for the off-chain circle relayer
cd relayer
npm ci

npm run build
npm run start-price-relayer
```
