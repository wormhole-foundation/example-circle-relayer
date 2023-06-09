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

Before deploying the contracts, set the `Deployment Variables` and `RPC` for your target networks in the following directories:

- `evm/env/testnet`
- `evm/env/mainnet`

Then deploy the contracts by executing the following commands:

```

# goerli
. env/eth-goerli-testnet.env && PRIVATE_KEY=put_your_private_key_here bash shell-scripts/deploy_circle_relayer.sh

# fuji
. env/avax-fuji-testnet.env && PRIVATE_KEY=put_your_private_key_here bash shell-scripts/deploy_circle_relayer.sh

```

Make sure to deploy all contracts (save the contract addresses) before moving onto the `Initial Contract Setup` section of this README.md.

## Initial Contract Setup

First, copy the `evm/cfg/sampleDeployment.json` file and update the values based on your deployment configuration:

```
# create the deployment.json file
cp evm/cfg/sampleDeployment.json evm/cfg/deployment.json
```

Next, register the deployed contracts by running the following command for each target network:

```
# start from the evm directory
cd evm

# register the contracts
source env/testnet_or_mainnet/your_file.env && PRIVATE_KEY=your_private_key yarn register-contracts
```

Finally, set up the deployed contracts by running the following command for each target network:

```
# start from the evm directory
cd evm

# set up the contracts
source env/testnet_or_mainnet/your_file.env && PRIVATE_KEY=your_private_key yarn configure-contract \
-s true -r true -m true
```

Where the three command-line arguments are defined as:

- `-s` - Sets the native swap rate for the configured tokens.
- `-m` - Sets the max native swap amount for the configured tokens.
- `-r` - Sets the outbound relayer fee for the configured tokens and chains.

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
