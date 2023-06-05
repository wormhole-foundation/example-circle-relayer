#/bin/bash

pgrep anvil > /dev/null
if [ $? -eq 0 ]; then
    echo "anvil already running"
    exit 1;
fi

echo "Starting anvil"

# ethereum goerli testnet
anvil \
    -m "myth like bonus scare over problem client lizard pioneer submit female collect" \
    --port 8546 \
    --fork-url $ETH_FORK_RPC > anvil_eth.log &

# avalanche fuji testnet
anvil \
    -m "myth like bonus scare over problem client lizard pioneer submit female collect" \
    --port 8547 \
    --fork-url $AVAX_FORK_RPC > anvil_avax.log &

pgrep anvil

sleep 2

## first key from mnemonic above
export PRIVATE_KEY=$WALLET_PRIVATE_KEY

mkdir -p cache
cp -v foundry.toml cache/foundry.toml
cp -v foundry-test.toml foundry.toml

echo "deploy contracts"
RELEASE_WORMHOLE_ADDRESS=$ETH_WORMHOLE_ADDRESS \
RELEASE_CIRCLE_INTEGRATION_ADDRESS=$ETH_CIRCLE_INTEGRATION_ADDRESS \
RELEASE_NATIVE_TOKEN_DECIMALS=$ETH_NATIVE_TOKEN_DECIMALS \
RELEASE_FEE_RECIPIENT=$TESTING_FEE_RECIPIENT \
forge script forge-scripts/deploy_contracts.sol \
    --rpc-url http://localhost:8546 \
    --private-key $PRIVATE_KEY \
    --broadcast --slow > deploy.out 2>&1

RELEASE_WORMHOLE_ADDRESS=$AVAX_WORMHOLE_ADDRESS \
RELEASE_CIRCLE_INTEGRATION_ADDRESS=$AVAX_CIRCLE_INTEGRATION_ADDRESS \
RELEASE_NATIVE_TOKEN_DECIMALS=$AVAX_NATIVE_TOKEN_DECIMALS \
RELEASE_FEE_RECIPIENT=$TESTING_FEE_RECIPIENT \
forge script forge-scripts/deploy_contracts.sol \
    --rpc-url http://localhost:8547 \
    --private-key $PRIVATE_KEY \
    --broadcast --slow >> deploy.out 2>&1

echo "overriding foundry.toml"
mv -v cache/foundry.toml foundry.toml

## run tests here
npx ts-mocha -t 1000000 ts-test/test/*.ts

# nuke
pkill anvil
