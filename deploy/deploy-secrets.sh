#!/usr/bin/env sh

# should do this only once
if [[ "$1" == "--testnet" ]]; then
    source testnet/env.testnet.sh
elif [[ "$1" == "--mainnet" ]]; then
    source mainnet/env.mainnet.sh
else
    echo "Invalid argument. Please use --testnet or --mainnet. and the tag as a positional parameter. Example: ./deploy-secrets.sh --testnet"
fi

sh ./inject-privatekey-secret.sh
sh ./inject-redis-secret.sh
sh ./inject-influx-secret.sh
