# WH x CCTP USDC Bridge Example

Please start by reading the [design document](https://github.com/wormhole-foundation/example-circle-relayer/blob/main/DESIGN.md).

## Wormhole-Scaffolding

This repository was generated from the [wormhole-scaffolding](https://github.com/wormhole-foundation/wormhole-scaffolding) template. We recommend using this template as a starting point for cross-chain development on Wormhole.

## Prerequisites

Install [Foundry tools](https://book.getfoundry.sh/getting-started/installation), which include `forge`, `anvil` and `cast` CLI tools.

## Build

Run the following commands to install necessary dependencies and to build the smart contracts:

```shell
cd evm
make dependencies
make build
```

## Testing Environment

The testing environments can be found in the following locations:

- [Unit Tests](https://github.com/wormhole-foundation/example-circle-relayer/blob/main/evm/forge-test/CircleRelayer.t.sol)
- [Integration Tests](https://github.com/wormhole-foundation/example-circle-relayer/tree/main/evm/ts-test)

First, set the `RPC` variable in `evm/env/testing.env`. Then run the tests with the following commands:

```shell
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

```bash
# sepolia
. env/testnet/eth.env && shell-scripts/deploy_circle_relayer.sh --private-key put_your_private_key_here

# fuji
. env/testnet/avax.env && shell-scripts/deploy_circle_relayer.sh --private-key put_your_private_key_here
```

Make sure to deploy all contracts (save the contract addresses) before moving onto the `Initial Contract Setup` section of this README.md.

### Hardware wallet deployment

Alternatively, Foundry supports signing with both Ledger and Trezor wallets.

You might need to specify all three of the following arguments:
- `--ledger` or `--trezor` to select which hardware wallet should be used to sign.
- `--mnemonic-derivation-paths <derivation path of account>` to select the path derivation for the account.
- `--sender <EVM address>` to specify the address of the selected account. Might be necessary to workaround some tx simulation issues.

So for example, you would execute:

```bash
# sepolia
source env/testnet/eth.env && shell-scripts/deploy_circle_relayer.sh --ledger --mnemonic-derivation-paths your_derivation_path --sender your_address_for_given_path
```

to deploy on sepolia with a ledger wallet.

## Contract verification

To verify the contract, you need an API token for the corresponding block explorer. The verification script uses `forge verify-contract` which verifies the contract on etherscan-like block explorers.
Ensure that the verification environment variables `RELEASE_EVM_CHAIN_ID` and `RELEASE_CIRCLE_RELAYER_ADDRESS` are set correctly:
- `RELEASE_EVM_CHAIN_ID` must be set to the EIP-155 chain id.
- `RELEASE_CIRCLE_RELAYER_ADDRESS` must be set to the address where you deployed the contract.

Then, you only need to run the following:

```bash
# Contract verification
source env/testnet_or_mainnet/your_file.env && shell-scripts/verify_contracts.sh your_api_token
```

## Initial Contract Setup

First, copy the `evm/cfg/sampleDeployment.json` file and update the values based on your deployment configuration:

```bash
# start from the evm directory
cd evm
# create the myDeployment.json file
cp cfg/sampleDeployment.json cfg/myDeployment.json
# Set the path of the configuration file in an environment variable that's read by all scripts
export CONFIGURE_CCTP_CONFIG=cfg/myDeployment.json
```

Next, register the deployed contracts by running the following command for each target network:

```bash
# register the contracts
source env/testnet_or_mainnet/your_file.env && PRIVATE_KEY=your_private_key yarn register-contracts
```

Finally, set up the deployed contracts by running the following command for each target network:

```bash
# set up the contracts
source env/testnet_or_mainnet/your_file.env && PRIVATE_KEY=your_private_key yarn configure-contract \
--setSwapRate --setRelayerFee --setMaxSwapAmount
```

Where the three command-line arguments are defined as:

- `--setSwapRate` - Sets the native swap rate for the configured tokens.
- `--setMaxSwapAmount` - Sets the max native swap amount for the configured tokens.
- `--setRelayerFee` - Sets the outbound relayer fee for the configured tokens and chains.

### Signing configuration transactions with a hardware wallet

Only signing txs with a Ledger device is supported at this time.
Ensure you've created a deployment configuration file and set `CONFIGURE_CCTP_CONFIG` to its path.

```bash
export CONFIGURE_CCTP_LEDGER=true
export CONFIGURE_CCTP_DERIVATION_PATH=your_derivation_path

# Register the contracts
source env/testnet_or_mainnet/your_file.env && npx ts-node ts/scripts/registerContracts.ts

# Set the swap rate and relayer fee for other chains
source env/testnet_or_mainnet/your_file.env && npx ts-node ts/scripts/configureContract.ts --setSwapRate --setRelayerFee --setMaxSwapAmount
```


## Off-Chain Circle Relayer

Copy the sample `.env` file in the `relayer` directory and set the values:

```shell
cp .env.sample .env
```

To run the off-chain relayer process, check that the contract addresses are correct in the `relayer/src/circleRelayer/main.ts` file, then run the following commands:

```shell
cd relayer
npm ci
npm run build
npm run start-circle-relayer
```

## Off-Chain Price Relayer

Copy the sample `.env` file in the `relayer` directory and set the values (this .env file is shared with the Off-Chain Circle Relayer process):

```shell
cp .env.sample .env
```

Copy the `priceRelayerSample.json` file in the `relayer/cfg` directory and set the values:

```shell
cp priceRelayerSample.json priceRelayer.json
```

To run the off-chain relayer process, check that the contract addresses are correct in the `relayer/src/priceRelayer/main.ts` file, then run the following commands:

```shell
# only run these if you haven't already for the off-chain circle relayer
cd relayer
npm ci

npm run build
npm run start-price-relayer
```
