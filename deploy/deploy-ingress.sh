#!/usr/bin/env sh


if [[ "$1" == "--testnet" ]]; then
    source testnet/env.testnet.sh
    kubetpl render ./circle-api.ingress.yaml -s HOSTNAME="relayer.dev.stable.io" -s CERTIFICATE="$CERTIFICATE" | kubectl apply -f -
elif [[ "$1" == "--mainnet" ]]; then
    source mainnet/env.mainnet.sh
    kubetpl render ./circle-api.ingress.yaml -s HOSTNAME="relayer.stable.io" -s CERTIFICATE="$CERTIFICATE" | kubectl apply -f -
else
    echo "Invalid argument. Please use --testnet or --mainnet. and the tag as a positional parameter. Example: ./deploy-ingress.sh --testnet 2.0.1"
fi

