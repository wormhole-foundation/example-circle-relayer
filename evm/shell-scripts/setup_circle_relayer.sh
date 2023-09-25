#!/bin/bash

forge script forge-scripts/setup_contracts.sol \
    --rpc-url $RPC \
    --private-key $PRIVATE_KEY \
    --broadcast --slow
