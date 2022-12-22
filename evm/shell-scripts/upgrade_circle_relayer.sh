#!/bin/bash

forge script forge-scripts/upgrade_contracts.sol \
    --rpc-url $RPC \
    --private-key $PRIVATE_KEY \
    --broadcast --slow
