# Circle-Relayer

## Prerequisites

Install [Foundry tools](https://book.getfoundry.sh/getting-started/installation), which include `forge`, `anvil` and `cast` CLI tools.

## Build

Run the following commands to install necessary dependencies and to build the smart contracts:

```
make dependencies
make build
```

## Test Suite

Run the Solidity based unit tests:

```
make unit-test
```

Run the local-validator integration tests:

```
make integration-test
```

To run both the Solidity based unit tests and the local-validator integration test:

```
make test
```
