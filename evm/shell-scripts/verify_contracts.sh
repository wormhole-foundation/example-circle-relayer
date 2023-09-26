#/bin/bash

set -o xtrace

etherscan_key=$1

forge verify-contract --chain $RELEASE_EVM_CHAIN_ID --watch --etherscan-api-key $etherscan_key \
--constructor-args $(cast abi-encode "constructor(address,uint8,address,address)" $RELEASE_CIRCLE_INTEGRATION_ADDRESS $RELEASE_NATIVE_TOKEN_DECIMALS $RELEASE_FEE_RECIPIENT $RELEASE_OWNER_ASSISTANT) \
    $RELEASE_CIRCLE_RELAYER_ADDRESS \
    src/circle-relayer/CircleRelayer.sol:CircleRelayer
